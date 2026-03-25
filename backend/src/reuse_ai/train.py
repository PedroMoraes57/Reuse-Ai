from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import timm
import torch
from rich.console import Console
from rich.table import Table
from sklearn.metrics import f1_score
from torch import nn
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from tqdm import tqdm

from reuse_ai.config import ensure_runtime_dirs, load_project_config
from reuse_ai.data import DatasetBundle, build_dataloaders


console = Console()


def _resolve_device(config: dict[str, Any]) -> torch.device:
    prefer_cuda = bool(config["training"].get("prefer_cuda", True))
    if prefer_cuda and torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def _create_model(config: dict[str, Any], num_classes: int) -> nn.Module:
    model = timm.create_model(
        config["model"]["name"],
        pretrained=bool(config["model"].get("pretrained", True)),
        num_classes=num_classes,
        drop_rate=float(config["model"].get("dropout", 0.0)),
    )
    return model


def _run_epoch(
    model: nn.Module,
    loader: torch.utils.data.DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer | None,
    scaler: torch.cuda.amp.GradScaler,
    device: torch.device,
    mixed_precision: bool,
    grad_clip_norm: float,
) -> dict[str, float]:
    is_training = optimizer is not None
    model.train(is_training)
    total_loss = 0.0
    correct = 0
    total = 0
    targets_all: list[int] = []
    predictions_all: list[int] = []

    progress = tqdm(loader, leave=False)
    for images, targets in progress:
        images = images.to(device, non_blocking=True)
        targets = targets.to(device, non_blocking=True)
        if device.type == "cuda":
            images = images.to(memory_format=torch.channels_last)

        if is_training:
            optimizer.zero_grad(set_to_none=True)

        with torch.set_grad_enabled(is_training):
            if mixed_precision and device.type == "cuda":
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    outputs = model(images)
                    loss = criterion(outputs, targets)
            else:
                outputs = model(images)
                loss = criterion(outputs, targets)

        if is_training:
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            if grad_clip_norm > 0:
                torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip_norm)
            scaler.step(optimizer)
            scaler.update()

        predicted = outputs.argmax(dim=1)
        batch_size = images.size(0)
        total_loss += loss.item() * batch_size
        correct += (predicted == targets).sum().item()
        total += batch_size
        targets_all.extend(targets.detach().cpu().tolist())
        predictions_all.extend(predicted.detach().cpu().tolist())
        progress.set_description(f"loss={loss.item():.4f}")

    accuracy = correct / max(total, 1)
    macro_f1 = f1_score(targets_all, predictions_all, average="macro") if targets_all else 0.0
    loss_value = total_loss / max(total, 1)
    return {"loss": loss_value, "accuracy": accuracy, "macro_f1": macro_f1}


def _print_epoch_summary(epoch: int, train_metrics: dict[str, float], val_metrics: dict[str, float]) -> None:
    table = Table(title=f"Epoch {epoch}")
    table.add_column("Split")
    table.add_column("Loss")
    table.add_column("Accuracy")
    table.add_column("Macro F1")
    table.add_row("train", f"{train_metrics['loss']:.4f}", f"{train_metrics['accuracy']:.2%}", f"{train_metrics['macro_f1']:.4f}")
    table.add_row("val", f"{val_metrics['loss']:.4f}", f"{val_metrics['accuracy']:.2%}", f"{val_metrics['macro_f1']:.4f}")
    console.print(table)


def _save_checkpoint(
    path: Path,
    model: nn.Module,
    config: dict[str, Any],
    class_names: list[str],
    best_metric: float,
) -> None:
    torch.save(
        {
            "model_name": config["model"]["name"],
            "dropout": config["model"].get("dropout", 0.0),
            "image_size": config["model"]["image_size"],
            "state_dict": model.state_dict(),
            "class_names": class_names,
            "best_macro_f1": best_metric,
        },
        path,
    )


def train(config_path: str | Path | None = None) -> dict[str, Any]:
    config = load_project_config(config_path) if config_path else load_project_config()
    ensure_runtime_dirs(config)

    bundle: DatasetBundle = build_dataloaders(config)
    device = _resolve_device(config)
    model = _create_model(config, len(bundle.class_names)).to(device)
    if device.type == "cuda":
        model = model.to(memory_format=torch.channels_last)

    criterion = nn.CrossEntropyLoss(
        weight=bundle.class_weights.to(device),
        label_smoothing=float(config["training"]["label_smoothing"]),
    )
    optimizer = AdamW(
        model.parameters(),
        lr=float(config["training"]["learning_rate"]),
        weight_decay=float(config["training"]["weight_decay"]),
    )
    scheduler = CosineAnnealingLR(optimizer, T_max=int(config["training"]["epochs"]))
    scaler = torch.cuda.amp.GradScaler(enabled=bool(config["training"]["mixed_precision"]) and device.type == "cuda")
    checkpoint_path = Path(config["paths"]["checkpoint_path"])
    history_path = Path(config["paths"]["checkpoint_dir"]) / "training_history.json"

    console.print(
        f"[bold green]Treino iniciado[/bold green] | "
        f"device={device} | train={bundle.train_size} | val={bundle.val_size} | test={bundle.test_size}"
    )

    start_time = time.time()
    best_metric = -1.0
    patience_counter = 0
    history: list[dict[str, Any]] = []

    for epoch in range(1, int(config["training"]["epochs"]) + 1):
        train_metrics = _run_epoch(
            model=model,
            loader=bundle.train_loader,
            criterion=criterion,
            optimizer=optimizer,
            scaler=scaler,
            device=device,
            mixed_precision=bool(config["training"]["mixed_precision"]),
            grad_clip_norm=float(config["training"]["grad_clip_norm"]),
        )
        val_metrics = _run_epoch(
            model=model,
            loader=bundle.val_loader,
            criterion=criterion,
            optimizer=None,
            scaler=scaler,
            device=device,
            mixed_precision=bool(config["training"]["mixed_precision"]),
            grad_clip_norm=0.0,
        )
        scheduler.step()
        _print_epoch_summary(epoch, train_metrics, val_metrics)

        history_entry = {
            "epoch": epoch,
            "train": train_metrics,
            "val": val_metrics,
            "lr": scheduler.get_last_lr()[0],
        }
        history.append(history_entry)

        if val_metrics["macro_f1"] > best_metric:
            best_metric = val_metrics["macro_f1"]
            patience_counter = 0
            _save_checkpoint(checkpoint_path, model, config, bundle.class_names, best_metric)
            console.print(f"[green]Novo melhor checkpoint salvo em {checkpoint_path}[/green]")
        else:
            patience_counter += 1
            console.print(f"[yellow]Sem melhora nesta epoca. patience={patience_counter}[/yellow]")

        if patience_counter >= int(config["training"]["patience"]):
            console.print("[bold yellow]Early stopping acionado.[/bold yellow]")
            break

    test_metrics = None
    if bundle.test_loader is not None and checkpoint_path.exists():
        best_checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
        model.load_state_dict(best_checkpoint["state_dict"])
        test_metrics = _run_epoch(
            model=model,
            loader=bundle.test_loader,
            criterion=criterion,
            optimizer=None,
            scaler=scaler,
            device=device,
            mixed_precision=bool(config["training"]["mixed_precision"]),
            grad_clip_norm=0.0,
        )
        console.print(
            "[bold magenta]Teste[/bold magenta] "
            f"loss={test_metrics['loss']:.4f} "
            f"acc={test_metrics['accuracy']:.2%} "
            f"macro_f1={test_metrics['macro_f1']:.4f}"
        )

    history_path.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")
    elapsed_seconds = time.time() - start_time

    summary = {
        "checkpoint_path": str(checkpoint_path),
        "history_path": str(history_path),
        "best_macro_f1": best_metric,
        "elapsed_seconds": round(elapsed_seconds, 2),
        "device": str(device),
        "classes": bundle.class_names,
    }
    if test_metrics is not None:
        summary["test"] = test_metrics
    console.print(f"[bold cyan]Treino finalizado[/bold cyan] em {elapsed_seconds / 60:.2f} minutos")
    return summary

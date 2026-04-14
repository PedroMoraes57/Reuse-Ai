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
from torch.nn import functional as F
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR, LinearLR, SequentialLR
from torch.optim.swa_utils import AveragedModel, get_ema_multi_avg_fn
from tqdm import tqdm
from timm.data import Mixup

from reuse_ai.config import ensure_runtime_dirs, load_project_config
from reuse_ai.data import DatasetBundle, build_dataloaders
from reuse_ai.evaluation import (
    build_prototype_store,
    calibrate_prototype_similarity_thresholds,
    collect_model_outputs,
    evaluate_inference_policy,
    optimize_inference_policy,
    save_evaluation_report,
    serialize_prototype_store,
)


console = Console()


def _create_grad_scaler(enabled: bool, device: torch.device) -> torch.amp.GradScaler | torch.cuda.amp.GradScaler:
    if device.type != "cuda":
        return torch.cuda.amp.GradScaler(enabled=False)
    try:
        return torch.amp.GradScaler("cuda", enabled=enabled)
    except (AttributeError, TypeError):
        return torch.cuda.amp.GradScaler(enabled=enabled)


def _resolve_device(config: dict[str, Any]) -> torch.device:
    require_cuda = bool(config["training"].get("require_cuda", False))
    prefer_cuda = bool(config["training"].get("prefer_cuda", True))
    if prefer_cuda and torch.cuda.is_available():
        return torch.device("cuda")
    if require_cuda:
        raise RuntimeError(
            "CUDA e obrigatorio para o treino, mas a GPU nao esta disponivel para o PyTorch. "
            "Verifique driver NVIDIA, modulo do kernel e acesso a /dev/nvidia* antes de treinar."
        )
    return torch.device("cpu")


def _create_model(config: dict[str, Any], num_classes: int) -> nn.Module:
    model = timm.create_model(
        config["model"]["name"],
        pretrained=bool(config["model"].get("pretrained", True)),
        num_classes=num_classes,
        drop_rate=float(config["model"].get("dropout", 0.0)),
    )
    return model


def _create_scheduler(
    optimizer: torch.optim.Optimizer,
    config: dict[str, Any],
) -> torch.optim.lr_scheduler.LRScheduler:
    training_config = config["training"]
    epochs = int(training_config["epochs"])
    warmup_epochs = max(0, int(training_config.get("warmup_epochs", 0)))
    min_learning_rate = float(training_config.get("min_learning_rate", 0.0))
    if warmup_epochs <= 0 or warmup_epochs >= epochs:
        return CosineAnnealingLR(
            optimizer,
            T_max=max(1, epochs),
            eta_min=min_learning_rate,
        )

    warmup_scheduler = LinearLR(
        optimizer,
        start_factor=float(training_config.get("lr_warmup_start_factor", 0.2)),
        total_iters=warmup_epochs,
    )
    cosine_scheduler = CosineAnnealingLR(
        optimizer,
        T_max=max(1, epochs - warmup_epochs),
        eta_min=min_learning_rate,
    )
    return SequentialLR(
        optimizer,
        schedulers=[warmup_scheduler, cosine_scheduler],
        milestones=[warmup_epochs],
    )


class SoftTargetCrossEntropyWithWeights(nn.Module):
    def __init__(self, class_weights: torch.Tensor | None = None) -> None:
        super().__init__()
        self.register_buffer("class_weights", class_weights)

    def forward(self, inputs: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        if targets.ndim == 1:
            return F.cross_entropy(inputs, targets, weight=self.class_weights)

        log_probabilities = F.log_softmax(inputs, dim=-1)
        loss = -(targets * log_probabilities)
        if self.class_weights is not None:
            loss = loss * self.class_weights.unsqueeze(0)
        return loss.sum(dim=-1).mean()


def _create_mixup_fn(config: dict[str, Any], num_classes: int) -> Mixup | None:
    training_config = config["training"]
    mixup_alpha = float(training_config.get("mixup_alpha", 0.0))
    cutmix_alpha = float(training_config.get("cutmix_alpha", 0.0))
    if mixup_alpha <= 0 and cutmix_alpha <= 0:
        return None
    if int(training_config.get("batch_size", 0)) % 2 != 0:
        raise ValueError("batch_size deve ser par quando mixup/cutmix estiver ativo.")

    return Mixup(
        mixup_alpha=mixup_alpha,
        cutmix_alpha=cutmix_alpha,
        cutmix_minmax=None,
        prob=float(training_config.get("mixup_prob", 1.0)),
        switch_prob=float(training_config.get("mixup_switch_prob", 0.5)),
        mode="batch",
        label_smoothing=float(training_config.get("label_smoothing", 0.0)),
        num_classes=num_classes,
    )


def _run_epoch(
    model: nn.Module,
    loader: torch.utils.data.DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer | None,
    scaler: torch.cuda.amp.GradScaler,
    device: torch.device,
    mixed_precision: bool,
    grad_clip_norm: float,
    mixup_fn: Mixup | None = None,
    ema_model: AveragedModel | None = None,
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
        metric_targets = targets
        if device.type == "cuda":
            images = images.to(memory_format=torch.channels_last)

        if is_training:
            optimizer.zero_grad(set_to_none=True)
            if mixup_fn is not None and images.size(0) > 1 and images.size(0) % 2 == 0:
                images, targets = mixup_fn(images, targets)

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
            if ema_model is not None:
                ema_model.update_parameters(model)

        predicted = outputs.argmax(dim=1)
        batch_size = images.size(0)
        total_loss += loss.item() * batch_size
        correct += (predicted == metric_targets).sum().item()
        total += batch_size
        targets_all.extend(metric_targets.detach().cpu().tolist())
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
    model_state_dict: dict[str, Any],
    config: dict[str, Any],
    class_names: list[str],
    best_metric: float,
    best_epoch: int,
) -> None:
    torch.save(
        {
            "model_name": config["model"]["name"],
            "dropout": config["model"].get("dropout", 0.0),
            "image_size": config["model"]["image_size"],
            "inference": dict(config.get("inference", {})),
            "state_dict": model_state_dict,
            "class_names": class_names,
            "best_macro_f1": best_metric,
            "best_epoch": best_epoch,
        },
        path,
    )


def _update_checkpoint_metadata(
    checkpoint_path: Path,
    inference_config: dict[str, Any],
    report_dir: Path,
    prototype_payload: dict[str, Any] | None = None,
) -> None:
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    checkpoint["inference"] = {
        key: value for key, value in inference_config.items() if key != "class_names"
    }
    checkpoint["report_dir"] = str(report_dir)
    if prototype_payload is not None:
        checkpoint["prototype_store"] = prototype_payload
    else:
        checkpoint.pop("prototype_store", None)
    torch.save(checkpoint, checkpoint_path)


def _report_dir(config: dict[str, Any], checkpoint_path: Path) -> Path:
    return Path(config["paths"]["report_dir"]) / checkpoint_path.stem


def train(config_path: str | Path | None = None) -> dict[str, Any]:
    config = load_project_config(config_path) if config_path else load_project_config()
    ensure_runtime_dirs(config)

    bundle: DatasetBundle = build_dataloaders(config)
    device = _resolve_device(config)
    if device.type == "cuda":
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
    model = _create_model(config, len(bundle.class_names)).to(device)
    if device.type == "cuda":
        model = model.to(memory_format=torch.channels_last)
    use_model_ema = bool(config["training"].get("use_model_ema", True))
    ema_model = (
        AveragedModel(
            model,
            device=device,
            multi_avg_fn=get_ema_multi_avg_fn(float(config["training"].get("model_ema_decay", 0.9995))),
        )
        if use_model_ema
        else None
    )

    use_class_weights = bool(
        config["training"].get(
            "use_class_weights",
            not bool(config["training"].get("balanced_sampling", False)),
        )
    )
    loss_class_weights = bundle.class_weights.to(device) if use_class_weights else None
    mixup_fn = _create_mixup_fn(config, len(bundle.class_names))
    criterion: nn.Module
    if mixup_fn is not None:
        criterion = SoftTargetCrossEntropyWithWeights(loss_class_weights)
    else:
        criterion = nn.CrossEntropyLoss(
            weight=loss_class_weights,
            label_smoothing=float(config["training"]["label_smoothing"]),
        )
    optimizer = AdamW(
        model.parameters(),
        lr=float(config["training"]["learning_rate"]),
        weight_decay=float(config["training"]["weight_decay"]),
    )
    scheduler = _create_scheduler(optimizer, config)
    scaler = _create_grad_scaler(
        enabled=bool(config["training"]["mixed_precision"]) and device.type == "cuda",
        device=device,
    )
    checkpoint_path = Path(config["paths"]["checkpoint_path"])
    history_path = Path(config["paths"]["checkpoint_dir"]) / "training_history.json"
    report_dir = _report_dir(config, checkpoint_path)

    console.print(
        f"[bold green]Treino iniciado[/bold green] | "
        f"device={device} | train={bundle.train_size} | val={bundle.val_size} | test={bundle.test_size}"
    )

    start_time = time.time()
    best_metric = -1.0
    best_epoch = 0
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
            mixup_fn=mixup_fn,
            ema_model=ema_model,
        )
        validation_model = ema_model.module if ema_model is not None else model
        val_metrics = _run_epoch(
            model=validation_model,
            loader=bundle.val_loader,
            criterion=criterion,
            optimizer=None,
            scaler=scaler,
            device=device,
            mixed_precision=bool(config["training"]["mixed_precision"]),
            grad_clip_norm=0.0,
            mixup_fn=None,
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
            best_epoch = epoch
            patience_counter = 0
            _save_checkpoint(
                checkpoint_path,
                (ema_model.module if ema_model is not None else model).state_dict(),
                config,
                bundle.class_names,
                best_metric,
                best_epoch,
            )
            console.print(f"[green]Novo melhor checkpoint salvo em {checkpoint_path}[/green]")
        else:
            patience_counter += 1
            console.print(f"[yellow]Sem melhora nesta epoca. patience={patience_counter}[/yellow]")

        if patience_counter >= int(config["training"]["patience"]):
            console.print("[bold yellow]Early stopping acionado.[/bold yellow]")
            break

    inference_report = None
    test_metrics = None
    if checkpoint_path.exists():
        best_checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=False)
        model.load_state_dict(best_checkpoint["state_dict"])

        inference_config = dict(config.get("inference", {}))
        train_reference_outputs = collect_model_outputs(
            model=model,
            loader=bundle.train_eval_loader,
            device=device,
            mixed_precision=bool(config["training"]["mixed_precision"]),
            tta_horizontal_flip=bool(inference_config.get("tta_horizontal_flip", True)),
        )
        val_outputs = collect_model_outputs(
            model=model,
            loader=bundle.val_loader,
            device=device,
            mixed_precision=bool(config["training"]["mixed_precision"]),
            tta_horizontal_flip=bool(inference_config.get("tta_horizontal_flip", True)),
        )
        prototype_store = (
            build_prototype_store(train_reference_outputs, bundle.class_names)
            if bool(inference_config.get("use_embedding_prototypes", True))
            else None
        )
        optimized_inference_config, calibration_report = optimize_inference_policy(
            collected=val_outputs,
            class_names=bundle.class_names,
            inference_config=inference_config,
            prototype_store=prototype_store,
        )
        prototype_thresholds = calibrate_prototype_similarity_thresholds(
            collected=val_outputs,
            class_names=bundle.class_names,
            inference_config=optimized_inference_config,
            prototype_store=prototype_store,
        )
        if prototype_store is not None and prototype_thresholds:
            prototype_store.similarity_thresholds = prototype_thresholds
            optimized_inference_config["prototype_similarity_thresholds"] = prototype_thresholds
            calibration_report["prototype_similarity_thresholds"] = prototype_thresholds

        _update_checkpoint_metadata(
            checkpoint_path,
            optimized_inference_config,
            report_dir,
            prototype_payload=serialize_prototype_store(prototype_store),
        )
        val_report = evaluate_inference_policy(
            collected=val_outputs,
            class_names=bundle.class_names,
            inference_config=optimized_inference_config,
            prototype_store=prototype_store,
        )
        save_evaluation_report(
            report_dir=report_dir,
            split_name="val",
            class_names=bundle.class_names,
            inference_config=optimized_inference_config,
            evaluation=val_report,
        )
        (report_dir / "calibration_report.json").write_text(
            json.dumps(calibration_report, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        console.print(
            "[bold blue]Calibracao[/bold blue] "
            f"temp={optimized_inference_config['temperature']:.4f} "
            f"conf={optimized_inference_config['confidence_threshold']:.2f} "
            f"margin={optimized_inference_config['margin_threshold']:.2f} "
            f"entropy={optimized_inference_config['entropy_threshold']:.2f} "
            f"consenso={optimized_inference_config['min_consensus']:.2f} "
            f"prototypes={len(prototype_store.similarity_thresholds) if prototype_store is not None else 0}"
        )
        console.print(
            "[bold blue]Val calibrado[/bold blue] "
            f"acc={val_report['summary']['accuracy']:.2%} "
            f"accepted={val_report['summary']['accepted_rate']:.2%} "
            f"accepted_acc={val_report['summary']['accepted_accuracy']:.2%}"
            if val_report["summary"]["accepted_accuracy"] is not None
            else "[bold blue]Val calibrado[/bold blue] sem amostras aceitas"
        )

        inference_report = {
            "report_dir": str(report_dir),
            "calibration": calibration_report,
            "validation": val_report["summary"],
            "inference_config": optimized_inference_config,
        }

        if bundle.test_loader is not None:
            test_outputs = collect_model_outputs(
                model=model,
                loader=bundle.test_loader,
                device=device,
                mixed_precision=bool(config["training"]["mixed_precision"]),
                tta_horizontal_flip=bool(optimized_inference_config.get("tta_horizontal_flip", True)),
            )
            test_report = evaluate_inference_policy(
                collected=test_outputs,
                class_names=bundle.class_names,
                inference_config=optimized_inference_config,
                prototype_store=prototype_store,
            )
            save_evaluation_report(
                report_dir=report_dir,
                split_name="test",
                class_names=bundle.class_names,
                inference_config=optimized_inference_config,
                evaluation=test_report,
            )
            test_metrics = test_report["summary"]
            console.print(
                "[bold magenta]Teste calibrado[/bold magenta] "
                f"acc={test_metrics['accuracy']:.2%} "
                f"accepted={test_metrics['accepted_rate']:.2%} "
                f"accepted_acc={test_metrics['accepted_accuracy']:.2%}"
                if test_metrics["accepted_accuracy"] is not None
                else "[bold magenta]Teste calibrado[/bold magenta] sem amostras aceitas"
            )

    history_path.write_text(json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")
    elapsed_seconds = time.time() - start_time

    summary = {
        "checkpoint_path": str(checkpoint_path),
        "history_path": str(history_path),
        "best_macro_f1": best_metric,
        "best_epoch": best_epoch,
        "elapsed_seconds": round(elapsed_seconds, 2),
        "device": str(device),
        "classes": bundle.class_names,
    }
    if inference_report is not None:
        summary["inference"] = inference_report
    if test_metrics is not None:
        summary["test"] = test_metrics
    console.print(f"[bold cyan]Treino finalizado[/bold cyan] em {elapsed_seconds / 60:.2f} minutos")
    return summary

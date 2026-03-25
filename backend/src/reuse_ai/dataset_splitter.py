from __future__ import annotations

import math
import random
import shutil
from pathlib import Path
from typing import Literal

from reuse_ai.catalog import list_class_ids
from reuse_ai.config import ensure_runtime_dirs, load_project_config
from reuse_ai.data import IMAGE_EXTENSIONS


SplitMode = Literal["copy", "move"]


def _validate_ratios(train_ratio: float, val_ratio: float, test_ratio: float) -> None:
    ratios = (train_ratio, val_ratio, test_ratio)
    if any(ratio <= 0 for ratio in ratios):
        raise ValueError("Todos os ratios devem ser maiores que zero.")
    if not math.isclose(sum(ratios), 1.0, rel_tol=1e-6, abs_tol=1e-6):
        raise ValueError("A soma de train_ratio, val_ratio e test_ratio deve ser 1.0.")


def _collect_images(class_root: Path) -> list[Path]:
    return sorted(
        path
        for path in class_root.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )


def _list_class_directories(root: Path) -> list[str]:
    if not root.exists():
        return []
    return sorted(path.name for path in root.iterdir() if path.is_dir() and not path.name.startswith("."))


def _calculate_split_counts(total_images: int, train_ratio: float, val_ratio: float, test_ratio: float) -> tuple[int, int, int]:
    if total_images < 3:
        raise ValueError("Cada classe precisa ter pelo menos 3 imagens para gerar train, val e test.")

    raw_counts = [
        total_images * train_ratio,
        total_images * val_ratio,
        total_images * test_ratio,
    ]
    counts = [math.floor(value) for value in raw_counts]
    remaining = total_images - sum(counts)

    remainders = sorted(
        range(3),
        key=lambda index: (raw_counts[index] - counts[index], raw_counts[index]),
        reverse=True,
    )
    for index in range(remaining):
        counts[remainders[index % 3]] += 1

    for split_index, current_count in enumerate(counts):
        if current_count > 0:
            continue
        donor_index = max(range(3), key=lambda index: counts[index])
        if counts[donor_index] <= 1:
            raise ValueError(
                "Nao foi possivel garantir ao menos 1 imagem por split. "
                "Adicione mais imagens a esta classe."
            )
        counts[donor_index] -= 1
        counts[split_index] += 1

    return counts[0], counts[1], counts[2]


def _reset_target_dirs(dataset_root: Path, class_ids: list[str]) -> None:
    for split in ("train", "val", "test"):
        split_root = dataset_root / split
        if split_root.exists():
            shutil.rmtree(split_root)
        split_root.mkdir(parents=True, exist_ok=True)
        for class_id in class_ids:
            target_dir = split_root / class_id
            target_dir.mkdir(parents=True, exist_ok=True)


def _copy_or_move_file(source: Path, target: Path, mode: SplitMode) -> None:
    if mode == "copy":
        shutil.copy2(source, target)
        return
    shutil.move(str(source), str(target))


def split_dataset(
    config_path: str | Path | None = None,
    train_ratio: float | None = None,
    val_ratio: float | None = None,
    test_ratio: float | None = None,
    seed: int | None = None,
    mode: SplitMode = "copy",
) -> dict[str, object]:
    config = load_project_config(config_path) if config_path else load_project_config()
    ensure_runtime_dirs(config)

    dataset_root = Path(config["paths"]["dataset_root"])
    raw_dataset_root = Path(config["paths"]["raw_dataset_root"])
    class_catalog_path = config["paths"]["class_catalog"]
    class_ids = list_class_ids(class_catalog_path)
    raw_class_ids = _list_class_directories(raw_dataset_root)

    split_config = config.get("dataset", {}).get("split", {})
    train_ratio = float(train_ratio if train_ratio is not None else split_config.get("train_ratio", 0.7))
    val_ratio = float(val_ratio if val_ratio is not None else split_config.get("val_ratio", 0.15))
    test_ratio = float(test_ratio if test_ratio is not None else split_config.get("test_ratio", 0.15))
    seed = int(seed if seed is not None else split_config.get("seed", 42))
    _validate_ratios(train_ratio, val_ratio, test_ratio)

    missing_raw_dirs = sorted(set(class_ids) - set(raw_class_ids))
    unexpected_raw_dirs = sorted(set(raw_class_ids) - set(class_ids))
    if missing_raw_dirs or unexpected_raw_dirs:
        messages: list[str] = []
        if missing_raw_dirs:
            messages.append(
                "Classes do catalogo sem pasta em raw/: " + ", ".join(missing_raw_dirs)
            )
        if unexpected_raw_dirs:
            messages.append(
                "Pastas extras em raw/ sem catalogo correspondente: " + ", ".join(unexpected_raw_dirs)
            )
        raise RuntimeError(" | ".join(messages))

    missing_classes: list[str] = []
    insufficient_classes: list[str] = []
    manifests: dict[str, list[Path]] = {}

    for class_id in class_ids:
        class_root = raw_dataset_root / class_id
        images = _collect_images(class_root) if class_root.exists() else []
        if not images:
            missing_classes.append(class_id)
            continue
        if len(images) < 3:
            insufficient_classes.append(f"{class_id} ({len(images)} imagem(ns))")
            continue
        manifests[class_id] = images

    if missing_classes or insufficient_classes:
        messages: list[str] = []
        if missing_classes:
            messages.append(
                "Classes sem imagens em raw/: " + ", ".join(missing_classes)
            )
        if insufficient_classes:
            messages.append(
                "Classes com menos de 3 imagens: " + ", ".join(insufficient_classes)
            )
        raise RuntimeError(" | ".join(messages))

    _reset_target_dirs(dataset_root, class_ids)
    rng = random.Random(seed)
    summary_by_class: dict[str, dict[str, int]] = {}

    for class_id in class_ids:
        images = list(manifests[class_id])
        rng.shuffle(images)
        train_count, val_count, test_count = _calculate_split_counts(
            len(images),
            train_ratio,
            val_ratio,
            test_ratio,
        )

        train_images = images[:train_count]
        val_images = images[train_count : train_count + val_count]
        test_images = images[train_count + val_count : train_count + val_count + test_count]

        split_mapping = {
            "train": train_images,
            "val": val_images,
            "test": test_images,
        }

        for split_name, split_images in split_mapping.items():
            target_dir = dataset_root / split_name / class_id
            for index, source_path in enumerate(split_images, start=1):
                target_name = f"{index:04d}_{source_path.name}"
                target_path = target_dir / target_name
                _copy_or_move_file(source_path, target_path, mode)

        summary_by_class[class_id] = {
            "raw_total": len(images),
            "train": len(train_images),
            "val": len(val_images),
            "test": len(test_images),
        }

    totals = {
        "raw_total": sum(item["raw_total"] for item in summary_by_class.values()),
        "train": sum(item["train"] for item in summary_by_class.values()),
        "val": sum(item["val"] for item in summary_by_class.values()),
        "test": sum(item["test"] for item in summary_by_class.values()),
    }

    return {
        "dataset_root": str(dataset_root),
        "raw_dataset_root": str(raw_dataset_root),
        "mode": mode,
        "seed": seed,
        "ratios": {
            "train": train_ratio,
            "val": val_ratio,
            "test": test_ratio,
        },
        "totals": totals,
        "classes": summary_by_class,
    }

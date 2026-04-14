from __future__ import annotations

import os
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import torch
from torch.utils.data import DataLoader, WeightedRandomSampler
from torchvision import datasets, transforms
from torchvision.transforms import InterpolationMode

from reuse_ai.catalog import list_class_ids


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass
class DatasetBundle:
    train_loader: DataLoader
    train_eval_loader: DataLoader
    val_loader: DataLoader
    test_loader: DataLoader | None
    class_names: list[str]
    class_weights: torch.Tensor
    train_size: int
    val_size: int
    test_size: int


def build_transforms(
    image_size: int,
    training_config: dict | None = None,
) -> tuple[transforms.Compose, transforms.Compose]:
    training_config = training_config or {}
    normalize = transforms.Normalize(
        mean=(0.485, 0.456, 0.406),
        std=(0.229, 0.224, 0.225),
    )
    grayscale_prob = float(training_config.get("grayscale_prob", 0.08))
    perspective_prob = float(training_config.get("perspective_prob", 0.2))
    affine_prob = float(training_config.get("affine_prob", 0.35))
    blur_prob = float(training_config.get("blur_prob", 0.12))
    autocontrast_prob = float(training_config.get("autocontrast_prob", 0.1))
    random_erasing_prob = float(training_config.get("random_erasing_prob", 0.18))
    randaugment_layers = int(training_config.get("randaugment_layers", 0))
    randaugment_magnitude = int(training_config.get("randaugment_magnitude", 7))
    random_augmentations: list[transforms.Transform] = []
    if randaugment_layers > 0:
        random_augmentations.append(
            transforms.RandAugment(
                num_ops=randaugment_layers,
                magnitude=randaugment_magnitude,
                interpolation=InterpolationMode.BILINEAR,
            )
        )
    train_transform = transforms.Compose(
        [
            transforms.RandomResizedCrop(
                image_size,
                scale=(0.5, 1.0),
                ratio=(0.65, 1.5),
                interpolation=InterpolationMode.BILINEAR,
                antialias=True,
            ),
            transforms.RandomHorizontalFlip(),
            *random_augmentations,
            transforms.RandomApply(
                [
                    transforms.RandomAffine(
                        degrees=18,
                        translate=(0.08, 0.08),
                        scale=(0.9, 1.1),
                        shear=(-8, 8),
                        interpolation=InterpolationMode.BILINEAR,
                    )
                ],
                p=affine_prob,
            ),
            transforms.RandomApply(
                [
                    transforms.RandomPerspective(
                        distortion_scale=0.18,
                        p=1.0,
                        interpolation=InterpolationMode.BILINEAR,
                    )
                ],
                p=perspective_prob,
            ),
            transforms.RandomApply(
                [
                    transforms.GaussianBlur(
                        kernel_size=3,
                        sigma=(0.1, 2.0),
                    )
                ],
                p=blur_prob,
            ),
            transforms.RandomApply([transforms.RandomAutocontrast()], p=autocontrast_prob),
            transforms.ColorJitter(brightness=0.35, contrast=0.35, saturation=0.3, hue=0.08),
            transforms.RandomGrayscale(p=grayscale_prob),
            transforms.ToTensor(),
            normalize,
            transforms.RandomErasing(
                p=random_erasing_prob,
                scale=(0.02, 0.12),
                ratio=(0.3, 3.3),
                value="random",
            ),
        ]
    )
    eval_transform = transforms.Compose(
        [
            transforms.Resize(
                int(image_size * 1.15),
                interpolation=InterpolationMode.BILINEAR,
                antialias=True,
            ),
            transforms.CenterCrop(image_size),
            transforms.ToTensor(),
            normalize,
        ]
    )
    return train_transform, eval_transform


def _count_images(root: Path) -> int:
    return sum(1 for path in root.rglob("*") if path.suffix.lower() in IMAGE_EXTENSIONS)


def _build_image_folder(root: Path, transform: transforms.Compose) -> datasets.ImageFolder:
    if not root.exists():
        raise FileNotFoundError(f"Pasta do split nao encontrada: {root}")
    if _count_images(root) == 0:
        raise RuntimeError(
            "Nenhuma imagem encontrada em "
            f"{root}. Coloque imagens em raw/<classe> e rode scripts/split_dataset.py antes de treinar."
        )
    return datasets.ImageFolder(root=str(root), transform=transform)


def _compute_class_weights(targets: list[int], num_classes: int) -> torch.Tensor:
    counts = Counter(targets)
    total = sum(counts.values())
    weights = []
    for class_index in range(num_classes):
        count = counts.get(class_index, 1)
        weights.append(total / (num_classes * count))
    return torch.tensor(weights, dtype=torch.float32)


def _num_workers(requested_workers: int) -> int:
    cpu_count = os.cpu_count() or 2
    return max(1, min(requested_workers, cpu_count))


def _build_balanced_sampler(targets: list[int]) -> WeightedRandomSampler:
    counts = Counter(targets)
    sample_weights = [1.0 / counts[target] for target in targets]
    return WeightedRandomSampler(
        weights=torch.tensor(sample_weights, dtype=torch.double),
        num_samples=len(targets),
        replacement=True,
    )


def _should_drop_last_train_batch(training_config: dict) -> bool:
    mixup_alpha = float(training_config.get("mixup_alpha", 0.0))
    cutmix_alpha = float(training_config.get("cutmix_alpha", 0.0))
    return bool(training_config.get("drop_last_train_batch", mixup_alpha > 0 or cutmix_alpha > 0))


def _validate_split_classes(split_name: str, actual_classes: list[str], expected_classes: list[str]) -> None:
    actual_set = set(actual_classes)
    expected_set = set(expected_classes)
    if actual_set == expected_set:
        return

    messages = [f"Classes do split {split_name} nao coincidem com o catalogo atual."]
    missing_classes = sorted(expected_set - actual_set)
    unexpected_classes = sorted(actual_set - expected_set)
    if missing_classes:
        messages.append("Faltando: " + ", ".join(missing_classes))
    if unexpected_classes:
        messages.append("Extras: " + ", ".join(unexpected_classes))
    messages.append("Rode scripts/split_dataset.py para recriar train/val/test.")
    raise RuntimeError(" | ".join(messages))


def build_dataloaders(config: dict) -> DatasetBundle:
    dataset_root = Path(config["paths"]["dataset_root"])
    expected_class_ids = list_class_ids(config["paths"]["class_catalog"])
    batch_size = int(config["training"]["batch_size"])
    num_workers = _num_workers(int(config["training"]["num_workers"]))
    image_size = int(config["model"]["image_size"])
    train_transform, eval_transform = build_transforms(image_size, config.get("training"))

    train_dataset = _build_image_folder(dataset_root / "train", train_transform)
    train_eval_dataset = _build_image_folder(dataset_root / "train", eval_transform)
    val_dataset = _build_image_folder(dataset_root / "val", eval_transform)

    test_root = dataset_root / "test"
    test_dataset = None
    if test_root.exists() and _count_images(test_root) > 0:
        test_dataset = _build_image_folder(test_root, eval_transform)

    _validate_split_classes("train", train_dataset.classes, expected_class_ids)
    _validate_split_classes("train_eval", train_eval_dataset.classes, expected_class_ids)
    _validate_split_classes("val", val_dataset.classes, expected_class_ids)
    if test_dataset is not None:
        _validate_split_classes("test", test_dataset.classes, expected_class_ids)

    class_names = train_dataset.classes
    if train_eval_dataset.classes != class_names:
        raise RuntimeError("As classes de treino e train_eval nao coincidem.")
    if val_dataset.classes != class_names:
        raise RuntimeError("As classes de treino e validacao nao coincidem.")
    if test_dataset is not None and test_dataset.classes != class_names:
        raise RuntimeError("As classes de treino e teste nao coincidem.")

    class_weights = _compute_class_weights(train_dataset.targets, len(class_names))
    balanced_sampling = bool(config["training"].get("balanced_sampling", False))
    sampler = _build_balanced_sampler(train_dataset.targets) if balanced_sampling else None
    drop_last_train_batch = _should_drop_last_train_batch(config["training"])

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=sampler is None,
        sampler=sampler,
        drop_last=drop_last_train_batch,
        num_workers=num_workers,
        pin_memory=True,
        persistent_workers=num_workers > 0,
    )
    train_eval_loader = DataLoader(
        train_eval_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
        persistent_workers=num_workers > 0,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
        persistent_workers=num_workers > 0,
    )
    test_loader = None
    if test_dataset is not None:
        test_loader = DataLoader(
            test_dataset,
            batch_size=batch_size,
            shuffle=False,
            num_workers=num_workers,
            pin_memory=True,
            persistent_workers=num_workers > 0,
        )

    return DatasetBundle(
        train_loader=train_loader,
        train_eval_loader=train_eval_loader,
        val_loader=val_loader,
        test_loader=test_loader,
        class_names=class_names,
        class_weights=class_weights,
        train_size=len(train_dataset),
        val_size=len(val_dataset),
        test_size=len(test_dataset) if test_dataset is not None else 0,
    )

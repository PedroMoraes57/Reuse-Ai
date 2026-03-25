from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml


ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG_PATH = ROOT_DIR / "configs" / "project.yaml"


def load_yaml(path: str | Path) -> dict[str, Any]:
    with Path(path).open("r", encoding="utf-8") as file:
        return yaml.safe_load(file) or {}


def resolve_path(value: str | Path) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return (ROOT_DIR / path).resolve()


def load_project_config(config_path: str | Path = DEFAULT_CONFIG_PATH) -> dict[str, Any]:
    config = load_yaml(config_path)
    paths = config.setdefault("paths", {})
    for key in (
        "dataset_root",
        "raw_dataset_root",
        "checkpoint_dir",
        "checkpoint_path",
        "class_catalog",
        "disposal_rules",
    ):
        if key in paths:
            paths[key] = resolve_path(paths[key])
    return config


def ensure_runtime_dirs(config: dict[str, Any]) -> None:
    paths = config["paths"]
    Path(paths["dataset_root"]).mkdir(parents=True, exist_ok=True)
    if "raw_dataset_root" in paths:
        Path(paths["raw_dataset_root"]).mkdir(parents=True, exist_ok=True)
    Path(paths["checkpoint_dir"]).mkdir(parents=True, exist_ok=True)
    checkpoint_parent = Path(paths["checkpoint_path"]).parent
    checkpoint_parent.mkdir(parents=True, exist_ok=True)
    (ROOT_DIR / "artifacts" / "captures").mkdir(parents=True, exist_ok=True)
    (ROOT_DIR / "artifacts  " / "logs").mkdir(parents=True, exist_ok=True)

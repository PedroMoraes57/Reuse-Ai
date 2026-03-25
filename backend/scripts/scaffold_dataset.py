from __future__ import annotations

from pathlib import Path

from _bootstrap import ensure_backend_src_on_path

ensure_backend_src_on_path()

from reuse_ai.catalog import list_class_ids
from reuse_ai.config import ensure_runtime_dirs, load_project_config


def main() -> None:
    config = load_project_config()
    ensure_runtime_dirs(config)
    dataset_root = Path(config["paths"]["dataset_root"])
    raw_dataset_root = Path(config["paths"]["raw_dataset_root"])
    catalog_path = config["paths"]["class_catalog"]
    class_ids = list_class_ids(catalog_path)

    for class_id in class_ids:
        (raw_dataset_root / class_id).mkdir(parents=True, exist_ok=True)

    for split in ("train", "val", "test"):
        for class_id in class_ids:
            (dataset_root / split / class_id).mkdir(parents=True, exist_ok=True)

    print(f"Scaffold criado em: {dataset_root}")
    print(f"Pasta raw criada em: {raw_dataset_root}")
    print(f"Classes criadas: {len(class_ids)}")
    print("Fluxo: preencha raw/<classe>/ e depois rode scripts/split_dataset.py")


if __name__ == "__main__":
    main()

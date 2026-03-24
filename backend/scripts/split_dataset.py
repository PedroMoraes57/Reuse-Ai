from __future__ import annotations

import argparse
import json
import sys

from _bootstrap import ensure_backend_src_on_path

ensure_backend_src_on_path()

from reuse_ai.dataset_splitter import split_dataset


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Divide automaticamente raw/ em train, val e test.")
    parser.add_argument("--train-ratio", type=float, default=None)
    parser.add_argument("--val-ratio", type=float, default=None)
    parser.add_argument("--test-ratio", type=float, default=None)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--mode", choices=("copy", "move"), default="copy")
    return parser


if __name__ == "__main__":
    args = build_parser().parse_args()
    try:
        summary = split_dataset(
            train_ratio=args.train_ratio,
            val_ratio=args.val_ratio,
            test_ratio=args.test_ratio,
            seed=args.seed,
            mode=args.mode,
        )
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    except Exception as error:
        print(f"Erro ao dividir dataset: {error}", file=sys.stderr)
        raise SystemExit(1) from error

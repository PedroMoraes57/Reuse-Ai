from __future__ import annotations

import argparse

from _bootstrap import ensure_backend_src_on_path

ensure_backend_src_on_path()

from reuse_ai.api import run


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Sobe a API local do Reuse.AI.")
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    return parser

if __name__ == "__main__":
    args = build_parser().parse_args()
    run(host=args.host, port=args.port)

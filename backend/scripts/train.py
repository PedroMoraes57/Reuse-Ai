from __future__ import annotations

import json
import sys

from _bootstrap import ensure_backend_src_on_path

ensure_backend_src_on_path()

from reuse_ai.train import train


if __name__ == "__main__":
    try:
        summary = train()
        print(json.dumps(summary, indent=2, ensure_ascii=False))
    except Exception as error:
        print(f"Erro ao treinar: {error}", file=sys.stderr)
        raise SystemExit(1) from error

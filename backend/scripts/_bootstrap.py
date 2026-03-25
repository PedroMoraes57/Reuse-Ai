from __future__ import annotations

import sys
from pathlib import Path


def ensure_backend_src_on_path() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    src_dir = backend_root / "src"
    src_dir_str = str(src_dir)
    if src_dir_str not in sys.path:
        sys.path.insert(0, src_dir_str)

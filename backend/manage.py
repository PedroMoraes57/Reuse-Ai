#!/usr/bin/env python
from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "django_backend.settings")

    # Ensure backend/src is on the path so we can import reuse_ai
    src_path = base_dir / "src"
    if str(src_path) not in sys.path:
        sys.path.insert(0, str(src_path))

    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()

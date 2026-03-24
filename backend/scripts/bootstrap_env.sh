#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd -- "${BACKEND_DIR}/.." && pwd)"

cd "${REPO_ROOT}"

python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip setuptools wheel
.venv/bin/pip install -r "${BACKEND_DIR}/requirements.txt"
.venv/bin/pip install -e "${BACKEND_DIR}"

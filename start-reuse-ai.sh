#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PYTHON_CANDIDATES=(
  "$SCRIPT_DIR/.venv/bin/python"
  "$SCRIPT_DIR/backend/.venv/bin/python"
  "$SCRIPT_DIR/backend/venv/bin/python"
)

for candidate in "${PYTHON_CANDIDATES[@]}"; do
  if [[ -x "$candidate" ]]; then
    exec "$candidate" "$SCRIPT_DIR/start_reuse_ai.py" "$@"
  fi
done

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$SCRIPT_DIR/start_reuse_ai.py" "$@"
fi

if command -v python >/dev/null 2>&1; then
  exec python "$SCRIPT_DIR/start_reuse_ai.py" "$@"
fi

echo "Nao encontrei Python para executar start_reuse_ai.py." >&2
exit 1

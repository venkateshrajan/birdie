#!/usr/bin/env bash
# Sets up the vendored Splitwise MCP server's Python venv.
#
# Why the symlink-dereference step: the venv lives inside the Next.js project
# root, and Turbopack refuses to build when it encounters a symlink that points
# outside the project (uv/venv symlink the interpreter to the system Python).
# We replace those interpreter symlinks with real copies so the build is happy.
#
# Requires `uv` (https://astral.sh/uv). Install with:
#   curl -LsSf https://astral.sh/uv/install.sh | sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/vendor/splitwise-mcp"
cd "$DIR"

echo "→ creating venv in $DIR/venv"
uv venv --python 3.13 venv
uv pip install --python venv -r requirements.txt

echo "→ dereferencing interpreter symlinks (Turbopack-safe)"
cd venv/bin
for f in python python3 python3.13; do
  if [ -L "$f" ]; then
    real="$(readlink -f "$f")"
    rm "$f"
    cp "$real" "$f"
  fi
done

echo "✓ Splitwise MCP venv ready. Put your key in vendor/splitwise-mcp/.env"
echo "  (or set SPLITWISE_API_KEY in Birdie's environment)."

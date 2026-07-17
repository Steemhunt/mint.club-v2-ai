#!/usr/bin/env bash
set -euo pipefail

if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
elif [[ -x "$HOME/.bun/bin/bun" ]]; then
  BUN_BIN="$HOME/.bun/bin/bun"
elif [[ -x "./node_modules/.bin/bun" ]]; then
  BUN_BIN="./node_modules/.bin/bun"
elif [[ -x "../node_modules/.bin/bun" ]]; then
  BUN_BIN="../node_modules/.bin/bun"
else
  echo "bun executable not found; run npm ci from the repository root" >&2
  exit 1
fi

rm -rf dist
METAFILE="$(mktemp)"
trap 'rm -f "$METAFILE"' EXIT

"$BUN_BIN" build src/index.ts \
  --outdir dist \
  --target node \
  --format esm \
  --packages bundle \
  --metafile="$METAFILE"

node ../scripts/generate-third-party-notices.mjs \
  "$METAFILE" \
  THIRD_PARTY_NOTICES.md \
  "Mint Club MCP server"

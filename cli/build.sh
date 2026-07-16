#!/usr/bin/env bash
set -euo pipefail

if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
elif [[ -x "$HOME/.bun/bin/bun" ]]; then
  BUN_BIN="$HOME/.bun/bin/bun"
elif [[ -x "./node_modules/.bin/bun" ]]; then
  BUN_BIN="./node_modules/.bin/bun"
else
  echo "bun executable not found; run npm ci from the repository root" >&2
  exit 1
fi

rm -rf dist
"$BUN_BIN" build src/index.ts \
  --outdir dist \
  --target node \
  --packages bundle \
  --define "__VERSION__=\"$(node -p "require('./package.json').version")\""

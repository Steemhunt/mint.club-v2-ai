#!/bin/bash
VERSION=$(node -p "require('./package.json').version")
bun build src/index.ts --outdir dist --format esm --target node --minify --define "__VERSION__=\"$VERSION\""

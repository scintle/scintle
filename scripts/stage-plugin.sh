#!/usr/bin/env bash
# Copies the files a release ships into .stage/scintle, for `claude --plugin-dir .stage/scintle`.
# Never load the repo itself: a hot-loaded plugin folder gets an engine-written tsconfig.json at its root.
set -euo pipefail
cd "$(dirname "$0")/.."
dest=.stage/scintle
rm -rf "$dest" && mkdir -p "$dest/web" "$dest/.claude-plugin"
cp .claude-plugin/plugin.json "$dest/.claude-plugin/"
cp -R hooks commands skills types server LICENSE NOTICE README.md "$dest/"
cp -R web/dist "$dest/web/"
rm -f "$dest"/hooks/*.test.tsx
echo "$PWD/$dest"

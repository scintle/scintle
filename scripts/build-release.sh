#!/usr/bin/env bash
# Builds the plugin's release zip: only the runtime files at a commit, one directory down.
# No lockfile and no dev dependencies, so Claude Code installs nothing extra.
# Usage: scripts/build-release.sh <commit-ish> <version> <out-dir>
set -euo pipefail

ref="$1"
version="$2"
out="$(mkdir -p "$3" && cd "$3" && pwd)"

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

# marketplace.json stays out: it holds this zip's hash.
git archive --format=tar --prefix=scintle/ "$ref" -- \
  .claude-plugin/plugin.json hooks commands server web/dist \
  LICENSE NOTICE README.md \
  | tar -x -C "$stage"

# Only release builds know where to send the opt-in daily count (D26); the repo's copy is empty.
if [ -n "${TELEMETRY_ENDPOINT:-}" ]; then
  f="$stage/scintle/server/telemetry.ts"
  grep -q "^const RELEASE_ENDPOINT = '';$" "$f" || { echo "RELEASE_ENDPOINT line not found in telemetry.ts" >&2; exit 1; }
  sed -i.bak "s#^const RELEASE_ENDPOINT = '';\$#const RELEASE_ENDPOINT = '${TELEMETRY_ENDPOINT}';#" "$f" && rm "$f.bak"
else
  echo "warning: TELEMETRY_ENDPOINT not set; this zip never sends the daily count" >&2
fi

# The .ts files are ES modules; this is all of package.json the runtime needs.
printf '{\n  "name": "scintle",\n  "version": "%s",\n  "private": true,\n  "type": "module"\n}\n' "$version" > "$stage/scintle/package.json"

zip="$out/scintle-$version.zip"
rm -f "$zip"
(cd "$stage" && zip -qrX "$zip" scintle)
echo "$zip"

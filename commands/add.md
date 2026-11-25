---
description: Let Scintle read this folder's plans and docs (it reads only Claude's own folder otherwise)
allowed-tools: Bash(node:*), Bash(echo:*)
---

!`NODE_NO_WARNINGS=1 node "${CLAUDE_PLUGIN_ROOT}/server/run.mjs" add "$PWD" || echo "Scintle needs Node.js 22.13 or newer on your PATH."`

Repeat the line above to the user exactly, and nothing else.

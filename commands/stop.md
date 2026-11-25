---
description: Stop the Scintle background server
allowed-tools: Bash(node:*), Bash(echo:*)
---

!`NODE_NO_WARNINGS=1 node "${CLAUDE_PLUGIN_ROOT}/server/run.mjs" stop || echo "Scintle needs Node.js 22.13 or newer on your PATH."`

Repeat the line above to the user exactly, and nothing else.

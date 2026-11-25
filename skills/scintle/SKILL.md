---
name: scintle
description: Open your Scintle idea board
# Only the person opens the board; Claude never does it on its own.
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(echo:*)
---

!`NODE_NO_WARNINGS=1 node "${CLAUDE_PLUGIN_ROOT}/server/run.mjs" open || echo "Scintle needs Node.js 22.13 or newer on your PATH."`

Repeat the line above to the user exactly, and nothing else.

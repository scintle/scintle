---
description: Show or change Scintle's opt-in anonymous usage count
argument-hint: status | enable | disable
allowed-tools: Bash(node:*), Bash(echo:*)
---

!`NODE_NO_WARNINGS=1 node "${CLAUDE_PLUGIN_ROOT}/server/run.mjs" telemetry $ARGUMENTS || echo "Scintle needs Node.js 22.13 or newer on your PATH."`

Repeat the text above to the user exactly, and nothing else.

---
description: Delete everything Scintle stored (asks first; "/scintle:forget yes" to confirm)
argument-hint: yes
allowed-tools: Bash(node:*), Bash(echo:*)
---

!`NODE_NO_WARNINGS=1 node "${CLAUDE_PLUGIN_ROOT}/server/run.mjs" forget $ARGUMENTS || echo "Scintle needs Node.js 22.13 or newer on your PATH."`

Repeat the text above to the user exactly, and nothing else. Never run this command again yourself.

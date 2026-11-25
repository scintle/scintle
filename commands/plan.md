---
description: Plan an idea from your Scintle board, with its full history
argument-hint: "[idea, or nothing for a picker]"
allowed-tools: Bash(node:*), Bash(echo:*), EnterPlanMode
---

!`NODE_NO_WARNINGS=1 node "${CLAUDE_PLUGIN_ROOT}/server/run.mjs" brief $ARGUMENTS || echo "Scintle needs Node.js 22.13 or newer on your PATH."`

The text above is a brief from Scintle, the user's idea board. If it says there is no such idea, tell the
user that and stop.

Otherwise enter plan mode now and plan an implementation of this idea as it stands. Treat "Decisions
already made" as settled, do not propose anything listed as dropped under "Tried before", and name any
open question that blocks the plan. Put the `scintle:idea=…` marker line from the brief at the top of
your plan, unchanged, so the plan is linked back to the idea.

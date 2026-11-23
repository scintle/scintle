---
description: Plan an idea from your Scintle board, with its full history
argument-hint: I-001
allowed-tools: Bash(node:*), EnterPlanMode
---

!`NODE_NO_WARNINGS=1 node --experimental-strip-types "${CLAUDE_PLUGIN_ROOT}/server/cli.ts" brief $ARGUMENTS`

The text above is a brief from Scintle, the user's idea board. If it says there is no such idea, tell the
user that and stop.

Otherwise enter plan mode now and plan an implementation of this idea as it stands. Treat "Decisions
already made" as settled, do not propose anything listed as dropped under "Tried before", and name any
open question that blocks the plan. Put the `scintle:idea=…` marker line from the brief at the top of
your plan, unchanged, so the plan is linked back to the idea.

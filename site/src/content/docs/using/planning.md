---
title: Planning an idea
description: Hand an idea's full history to Claude's planner with /scintle:plan.
---

When an idea is ready to build, its history is the best brief: what it's for now, what was decided, and which approaches were already tried and dropped.

## From the board

Open the idea and choose **Plan implementation**. The brief appears with two ways to use it:

- **Plan in a new session** opens a new terminal in the folder the idea was last worked in, running `/scintle:plan` for it. On macOS this is Terminal; the first time, macOS asks whether Scintle may control it. On Linux it uses your default terminal.
- **Copy /scintle:plan** copies the command, to run in a session you already have open.

## In Claude Code

```text
/scintle:plan I-007
```

This loads the idea's brief into your session and starts plan mode. The brief includes how the idea got here, what was decided, what was tried, and whether it was parked or dropped and why. Claude plans with the history in hand, so it doesn't repeat a dead end you already ruled out.

## The way back

When the plan is made, it appears on the idea's timeline as a **planned** event, linked to the brief version it was built on. If the idea changes later, for example it pivots, plans built on the older version show as out of date.

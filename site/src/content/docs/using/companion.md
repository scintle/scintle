---
title: Scintle in your chats
description: How Scintle shows up inside Claude Code, what each line means, and how to turn it off.
---

Scintle also works inside your Claude Code chats, so you don't have to open the board to get value from it. It's on by default; `/scintle companion off` turns all of it off.

## When you start a session

In a folder Scintle knows, one row appears above the prompt:

```text
✦ Where you left off: Weekly Pulse · decided “send it Friday afternoons” · 3d   [ Pick up ]  ↗ Board  ×
```

**Pick up** puts "Let's pick up Weekly Pulse (I-004) where I left off." in your prompt box; sending it is up to you. In a folder you work on several ideas in, like `~/Workspace`, it says **Last here** instead. Your home folder never gets one.

If Scintle read something since your last session, a second row says what: `✦ Scintle saved since your last session: a decision on Trail alerts · a new idea “Ferry delay map”`, with an **Open timeline** button that lands on the first of those moments.

## When you name an idea

When a prompt names one of your ideas, Claude is told it can look up that idea's history. If the prompt is about the idea, Claude reads it and answers knowing what you decided and dropped. A line under your prompt shows the most telling thing about it, with a button to the board:

```text
✦ Weekly Pulse  you decided “send it Friday afternoons” on Nov 20 · 2 decisions on record   [ ↗ See why ]
```

Names inside file paths, URLs and quotes are ignored, and each idea is pointed at once per chat.

## When you're about to repeat a dead end

If you propose something you already tried and dropped, Claude flags it, and the line under your prompt shows the board's record, in your words:

```text
⚠ Standup bot  you tried “a Slack bot that asks three questions” on Jul 14 and dropped it: nobody answered after day two   [ ↗ See why ]
```

Claude decides when it's a real repeat; Scintle supplies the evidence, so the warning is never made up.

## Planning

`/scintle:plan` on its own opens a picker of your ideas: type to search, press a number or click to plan. When you approve a plan in plan mode that's about one of your ideas, it's recorded on that idea's timeline straight away, and the line under your prompt says so.

## What it costs

Nothing extra: no model calls of its own. Scintle reads your chats in batches as before; when a batch from this chat lands, a row above the prompt says what it caught.

## What it sends

Idea names go into your chat with Claude when you name them, and an idea's history does too when Claude looks it up. Both go to Anthropic like the rest of the chat. See [What it reads, stores and sends](/scintle/trust/privacy/).

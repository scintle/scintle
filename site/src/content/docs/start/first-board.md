---
title: Your first board
description: The first read of your history, what it costs, and what you'll see.
---

The first time you open the board, it's empty, and Scintle asks before reading anything.

## The consent screen

It tells you:

- **Your history**: how many sessions are waiting, about how many model calls reading them takes, and roughly how long. The calls run on your own Claude plan. If they exceed the daily cap of 200 calls, the read spreads over several days.
- **New sessions**: read in batches as you work, about 3 calls per working session.
- **What's read**: only Claude's own folder, `~/.claude`.
- **What's sent**: what you said and what Claude answered, with secrets redacted first, to your own `claude` command.

Choose:

- **Start analyzing**: read your history, then keep up with new sessions.
- **Only new sessions**: skip the history; read from now on.
- **Not now**: nothing is read. You can still add ideas by hand.

## While it reads

A bar shows progress. Ideas appear as each session finishes, and you can keep working. Reading uses headless `claude -p` runs in the background; they never appear in your session list.

## What you'll see

Cards with dotted outlines are **inferred**: Scintle thinks this happened, but you haven't confirmed it. Open one to see its timeline and the words behind each event. Keep what's right, fix what's wrong; see [Correcting the board](/scintle/using/correcting/).

After the first read, the board may ask one more thing: whether to share an anonymous daily usage count. It's off unless you say yes; see [Telemetry](/scintle/trust/telemetry/).

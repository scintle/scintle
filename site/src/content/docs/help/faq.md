---
title: FAQ
description: Cost, other agents, Windows, and where your data lives.
---

## What does it cost?

Scintle is free and open source. Reading your sessions uses model calls on your own Claude plan, through your `claude` login: about 3 calls for a working session, and more for a first read of a long history. The consent screen estimates the first read before anything runs, and a daily cap (200 calls by default) bounds it. Scintle doesn't show prices, because what a call costs you depends on your plan.

## Which model does it use?

Sonnet by default. Set `SCINTLE_MODEL` to use another.

## Does it work with Codex, Cursor's agent or others?

Not yet. Only Claude Code sessions are read today; the reader is built so other agents can be added.

## Windows?

Not yet. macOS and Linux are supported.

## Where is my data?

In `~/.local/share/scintle`, on your machine. See [What it reads, stores and sends](/scintle/trust/privacy/).

## Does it change my Claude Code settings or files?

No. It never writes Claude Code's files or your config. It only reads `~/.claude` and folders you added.

## What happens when Claude Code deletes old transcripts?

Claude Code deletes transcripts after 30 days by default. Scintle deletes its copy of their text at the same time, but keeps your ideas, their events and a short quote for each. That's the point: the history outlives the chats. Cards show when a source chat is about to expire or is gone.

## Will it ever merge or delete my ideas by itself?

It never merges by itself; it asks. It can infer that an idea was dropped, but shows it as inferred until you keep it, and "Not interested" is only ever set by you.

## Can my team use it?

Not yet. Today a board is one person's, on one machine.

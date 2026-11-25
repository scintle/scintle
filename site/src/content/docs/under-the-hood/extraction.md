---
title: How ideas are found
description: How Scintle turns your sessions into ideas and events, and the checks it applies.
---

## When it reads

Each time a session pauses or ends, Scintle's hook tells the local server, which copies the new turns (redacted) into its database. That costs nothing. Reading them with a model happens in batches: when a session ends, after 30 idle minutes, when about one call's worth of conversation has built up, or when you run `/scintle sync`.

## What the model sees

One call reads one segment of a session, about 12k tokens:

- what you said, in full;
- Claude's answers, trimmed to their first and last 600 characters;
- the paths of files that were written;
- your current ideas (ID, title, problem, stage, latest events) and the [identity rules](/scintle/under-the-hood/identity/).

It answers with new ideas and events, each citing the turn it came from and a short quote.

## What's checked in code

The model's answer isn't trusted as is. An event is dropped if it names an unknown idea, uses an unknown type, or quotes words that aren't in the turn it cites. Merges are never applied; they become a question. An unsure pivot or narrowing is applied as inferred and raises a question. At most one question is asked per session. Small talk produces nothing, and that's a valid answer.

## The model

`claude -p` with your login, Sonnet by default, with tools, MCP servers, slash commands and your settings switched off for the call, and without saving it as a session.

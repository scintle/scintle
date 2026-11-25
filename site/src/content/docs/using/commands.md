---
title: Commands
description: Every Scintle slash command and terminal command.
---

## In Claude Code

Two commands. Everything else is a word after `/scintle`.

Where Claude Code doesn't load Scintle's in-chat part (a folder you haven't trusted yet, a policy that blocks it, or `--safe-mode`), use `/scintle:dashboard` in place of `/scintle`: it takes the same words.

| Command | What it does |
|---|---|
| `/scintle` | Starts the local server if needed and opens the board. |
| `/scintle:plan` | Opens a picker of your ideas; pick one to plan it with its full history. `/scintle:plan I-007` plans that idea directly. See [Planning an idea](/scintle/using/planning/). |

| After `/scintle` | What it does |
|---|---|
| `add` | Lets Scintle read the plans and docs in the folder you're in. See [Folders](/scintle/using/folders/). |
| `sync` | Reads waiting sessions now instead of at the next batch. |
| `stop` | Stops the background server. It also stops by itself after 6 idle hours. |
| `companion` | Shows whether the in-chat companion is on. Add `on` or `off` to change it. |
| `telemetry` | Shows whether usage sharing is on, and the exact next message. Add `enable` or `disable` to change it. See [Telemetry](/scintle/trust/telemetry/). |
| `forget` | Deletes everything Scintle stored. It says what it would delete; `/scintle forget yes` deletes. |

## From a clone of the repo

Developers can run the same tool with `npm run scintle -- <command>`. Two commands exist only there:

| Command | What it does |
|---|---|
| `import` | Builds the board from your existing history in one go, outside the server. |
| `ideas` | Prints every idea and its lineage as plain text. |

## Settings

Environment variables, for the curious:

| Variable | Default | Effect |
|---|---|---|
| `SCINTLE_DAILY_CALLS` | `200` | Daily cap on model calls. |
| `SCINTLE_MODEL` | `sonnet` | The model used to read sessions. |
| `SCINTLE_PORT` | `4873` | The board's port (it tries the next ten if busy). |
| `SCINTLE_HOME` | `~/.local/share/scintle` | Where Scintle keeps its data. |
| `DO_NOT_TRACK` | unset | Set to `1` to keep usage sharing off, whatever the board says. |

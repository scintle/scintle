---
title: Commands
description: Every Scintle slash command and terminal command.
---

## In Claude Code

| Command | What it does |
|---|---|
| `/scintle` | Starts the local server if needed and opens the board. |
| `/scintle:sync` | Reads waiting sessions now instead of at the next batch. |
| `/scintle:plan I-007` | Loads an idea's brief and plans it. See [Planning an idea](/scintle/using/planning/). |
| `/scintle:add` | Lets Scintle read the plans and docs in the folder you're in. See [Folders](/scintle/using/folders/). |
| `/scintle:stop` | Stops the background server. It also stops by itself after 6 idle hours. |
| `/scintle:telemetry` | Shows whether usage sharing is on, and the exact next message. Add `enable` or `disable` to change it. See [Telemetry](/scintle/trust/telemetry/). |
| `/scintle:forget` | Deletes everything Scintle stored. It says what it would delete; `/scintle:forget yes` deletes. |

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

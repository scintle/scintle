---
title: What it reads, stores and sends
description: Exactly what Scintle reads on your machine, what it keeps, and what leaves it.
---

## What it reads

- **Claude's own folder, `~/.claude`**: your session transcripts and the plans Claude saves.
- **Folders you add, and nothing else.** There's no scanning of your disk, your repos or your work folders. See [Folders Scintle reads](/scintle/using/folders/).

Nothing is read with a model until you say yes on the consent screen.

## What it stores

A folder at `~/.local/share/scintle` (or `$XDG_DATA_HOME/scintle`), readable only by you. Its database, `scintle.db`, holds:

- the redacted text of your sessions, while their transcripts exist. When Claude Code deletes a transcript, its text is deleted here too.
- your ideas, their events, and a short redacted quote and excerpt for each event. These stay after the transcript is gone; they're the history.
- digests of documents in folders you added, until you remove the folder.

Beside it: the logos drawn for your ideas, research reports you asked for, the server's log, and the usage-sharing setting.

**Redaction happens before anything is stored or sent.** It removes provider API keys and tokens, private keys, JWTs, bearer tokens, secret-named assignments (`DB_PASSWORD=…`), credentials in URLs, email addresses and your username in paths. It never guesses from randomness alone, so commit hashes and IDs survive as evidence. It's tested against a synthetic history full of secrets on every change.

## What it sends

- **To your own `claude` command, for reading sessions.** Scintle runs `claude -p` with your login, so session text goes to Anthropic under your account, exactly as when you chat. At most 200 calls a day by default.
- **An anonymous daily count, only if you said yes.** Off by default. See [Telemetry](/scintle/trust/telemetry/).
- **Nothing else.** The board is served from `127.0.0.1` and needs a token to open; nothing on it loads from the internet.

## This website

This documentation site counts page views with [Umami](https://umami.is), which sets no cookies. That's about the website only; the plugin on your machine sends nothing to it.

## Deleting everything

Run `/scintle:forget` in Claude Code, or delete the folder yourself:

```sh
rm -rf ~/.local/share/scintle
```

Uninstalling the plugin does **not** delete this folder, so your idea history survives a reinstall. See [Updating and uninstalling](/scintle/help/updating/).

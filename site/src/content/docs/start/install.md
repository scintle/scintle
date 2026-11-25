---
title: Install
description: Install the Scintle plugin for Claude Code on macOS or Linux.
---

## What you need

- **Claude Code** 2.1.292 or newer, logged in.
- **Node.js 22.13 or newer** on your `PATH`. Check with `node --version`. Claude Code doesn't ship Node; Scintle's hooks use yours.
- **macOS or Linux.** Windows isn't supported yet.

## Install

In a terminal:

```sh
npx scintle install
```

It checks your Node and Claude Code versions, shows the one command it will run, and asks before running it. It's Claude Code's own installer:

```sh
claude plugin install scintle --marketplace scintle/scintle
```

You can run that yourself instead. Or, inside a Claude Code session:

```text
/plugin marketplace add scintle/scintle
/plugin install scintle@scintle
```

Claude Code shows a trust prompt: plugins run code on your computer. Scintle's code is open; its hooks are in [`hooks/hooks.json`](https://github.com/scintle/scintle/blob/main/hooks/hooks.json) and do nothing but tell the local server a session moved.

Start a new Claude Code session so the plugin loads, then run:

```text
/scintle
```

That starts Scintle's local server and opens the board in your browser. Next: [your first board](/scintle/start/first-board/).

## Turn on updates

Claude Code doesn't auto-update plugins from marketplaces other than Anthropic's. To get new versions automatically, run `/plugin`, open **Marketplaces**, pick **scintle** and turn on auto-update. Or update by hand; see [Updating and uninstalling](/scintle/help/updating/).

## If Node is missing or too old

Scintle never breaks a session. Instead, a new session shows *"Scintle is paused: it needs Node.js 22.13 or newer"*, and `/scintle` says the same. Install a newer Node (for example with `nvm install 22`) and start a new session.

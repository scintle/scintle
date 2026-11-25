---
title: Troubleshooting
description: Fixes for the common problems, by symptom.
---

## "Scintle is paused: it needs Node.js 22.13 or newer"

Scintle's hooks run with the `node` on your `PATH`. Check it with `node --version`, install 22.13 or newer (for example `nvm install 22`, or from [nodejs.org](https://nodejs.org)), then start a new Claude Code session. If you use a version manager, make sure the newer Node is the default in new shells, since Claude Code starts hooks in a fresh shell.

## The board doesn't open

`/scintle` prints the board's link even when it can't open a browser (over SSH, for example). Open that link yourself. If it says *Scintle could not start*, look at the log it names, usually `~/.local/share/scintle/scintled.log`.

## Port 4873 is in use

Scintle tries the next ten ports by itself. To pick one, set `SCINTLE_PORT` in the environment Claude Code runs in.

## The board is empty

- **You haven't said yes yet.** The consent screen shows on the empty board; nothing is read before it.
- **You chose "Only new sessions".** History is skipped; ideas appear as you work.
- **Sessions are read in batches**: when a session ends, after 30 minutes idle, or when enough has piled up. Run `/scintle:sync` to read now.
- **No sessions in `~/.claude/projects`.** Scintle reads Claude Code's own transcripts; if you set `CLAUDE_CONFIG_DIR`, it reads that folder instead.

## "Claude Code is not logged in" or "`claude` isn't on your PATH"

Scintle reads sessions with your `claude` command. Run `claude` once in a terminal and sign in. If you installed Claude Code somewhere unusual, make sure `claude` runs from a new shell.

## It's using too many calls

Reading costs model calls on your Claude plan, capped at 200 a day. The app bar shows today's count. To lower the cap, set `SCINTLE_DAILY_CALLS`. To stop reading history, choose **Only new sessions** or stop the server with `/scintle:stop`.

## "Reached today's limit of model calls"

The daily cap was hit. Reading resumes tomorrow by itself, or raise `SCINTLE_DAILY_CALLS`.

## Something else

On the board, open the project menu, then **Help and feedback…**, then copy the diagnostics into a [bug report](https://github.com/scintle/scintle/issues/new?template=bug.yml). They hold versions, counts and error lines with secrets and paths removed, never your ideas.

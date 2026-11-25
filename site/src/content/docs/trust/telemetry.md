---
title: Telemetry
description: Scintle's opt-in anonymous daily count, field by field. Off unless you say yes.
---

Scintle can send one anonymous message a day so we can count how many people use it. **It's off unless you say yes**: the board asks once, on a later day than the first time you opened it, and ignoring the question counts as no.

## The whole message

```json
{
  "schema": 2,
  "event": "daily_active",
  "version": "0.1",
  "os": "darwin",
  "arch": "arm64",
  "new_install": false,
  "first_this_week": true,
  "first_this_month": false,
  "install_month": "2026-11",
  "used": { "board": true, "lineage": true, "replay": false, "plan": true, "research": false, "ask": false, "correct": false, "triage": true, "new_idea": false, "companion": true }
}
```

| Field | Values | Why |
|---|---|---|
| `schema` | `2` | Which version of this list the message follows. If it ever changes, Scintle asks you again. |
| `event` | `daily_active` | Scintle was used today. Counting messages per day gives daily users. |
| `version` | e.g. `0.1` | Scintle's major.minor version: who's on an old release. |
| `os` | `darwin`, `linux`, `win32`, `other` | Which platforms to support. |
| `arch` | `arm64`, `x64`, `other` | Which machines to test on. |
| `new_install` | `true` once | The first message this install ever sends: new installs per day. |
| `first_this_week` | `true` / `false` | Adding these up over a week gives weekly users, with no ID. |
| `first_this_month` | `true` / `false` | The same for monthly users. |
| `install_month` | `YYYY-MM` or `null` | Whether people who started in October still use it in December. Sent for six months, then `null`. |
| `used` | `true` / `false` for each feature | Which features were used since the last message, so we know what to improve. Yes or no only: never how often, when, or on which idea. |

The features in `used`:

| Feature | `true` when, since the last message, you… |
|---|---|
| `board` | opened the board |
| `lineage` | opened River or Constellation |
| `replay` | played Replay |
| `plan` | made a plan brief (`/scintle:plan`, **Plan**, or **Plan in a new session**) |
| `research` | started **Research** |
| `ask` | asked a question in ⌘K |
| `correct` | kept, removed or retyped an event Scintle inferred, answered its question, or undid something |
| `triage` | moved an idea between stages, or renamed one |
| `new_idea` | added an idea by hand |
| `companion` | had Claude look up one of your ideas in a chat (the companion) |

Features are noted on your machine only while sharing is on, and the list is cleared each time a message is sent.

That's all of it. The message is defined in one file, [`server/telemetry-schema.ts`](https://github.com/scintle/scintle/blob/main/server/telemetry-schema.ts), and the collector rejects anything else.

## What's never sent

No ID of any kind, so nothing links one day's message to the next. No idea names, quotes, session text, project or folder names, or paths. No exact counts of anything, and no times.

## How weekly users are counted without an ID

Your machine remembers, locally, whether it already sent a message this week and this month, and marks the first one. Adding up the marks gives weekly and monthly users. This is the technique [Brave describes for its usage ping](https://github.com/brave/brave-browser/wiki/Brave%E2%80%99s-Capture-of-Usage-Data).

## Where it goes

To a small collector we run on Cloudflare's free plan; its code is in [`telemetry/`](https://github.com/scintle/scintle/tree/main/telemetry). It adds 1 to that day's totals and throws the message away: no message is ever stored. Request logs are off, and it never reads your IP address or Cloudflare's location data. The totals are public at [scintle-telemetry.crozzfire.workers.dev](https://scintle-telemetry.crozzfire.workers.dev/), and any group smaller than 10 installs is hidden. Messages go to `https://scintle-telemetry.crozzfire.workers.dev/v1/ping`.

## Honest limits

- **"Anonymous", not "untraceable".** Cloudflare sees your IP address while delivering the message, as with any web request. We don't store it, but you have our word and our code for that, not a guarantee from physics.
- **The counts are estimates.** A reinstall, or using two machines, counts twice.
- **Only official releases send.** A copy built from the repo has no collector address and never sends.

## Check it, change it

- On the board: project menu, then **Usage sharing…** shows the next message, the last one sent, and an on/off switch.
- In Claude Code: `/scintle telemetry`, `/scintle telemetry enable`, `/scintle telemetry disable`.
- `DO_NOT_TRACK=1` or `SCINTLE_TELEMETRY_DISABLED=1` keeps it off whatever you chose. It's also off in CI.
- `SCINTLE_TELEMETRY_DEBUG=1` writes the message to Scintle's log instead of sending it.

Turning it off deletes the local marks, so turning it on later starts again as a new install.

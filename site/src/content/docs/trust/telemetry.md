---
title: Telemetry
description: Scintle's opt-in anonymous daily count, field by field. Off unless you say yes.
---

Scintle can send one anonymous message a day so we can count how many people use it. **It's off unless you say yes**: the board asks once, after your first read, and ignoring the question counts as no.

## The whole message

```json
{
  "schema": 1,
  "event": "daily_active",
  "version": "0.1",
  "os": "darwin",
  "arch": "arm64",
  "new_install": false,
  "first_this_week": true,
  "first_this_month": false,
  "install_month": "2026-11"
}
```

| Field | Values | Why |
|---|---|---|
| `schema` | `1` | Which version of this list the message follows. If it ever changes, Scintle asks you again. |
| `event` | `daily_active` | Scintle was used today. Counting messages per day gives daily users. |
| `version` | e.g. `0.1` | Scintle's major.minor version: who's on an old release. |
| `os` | `darwin`, `linux`, `win32`, `other` | Which platforms to support. |
| `arch` | `arm64`, `x64`, `other` | Which machines to test on. |
| `new_install` | `true` once | The first message this install ever sends: new installs per day. |
| `first_this_week` | `true` / `false` | Adding these up over a week gives weekly users, with no ID. |
| `first_this_month` | `true` / `false` | The same for monthly users. |
| `install_month` | `YYYY-MM` or `null` | Whether people who started in October still use it in December. Sent for six months, then `null`. |

That's all of it. The message is defined in one file, [`server/telemetry-schema.ts`](https://github.com/scintle/scintle/blob/main/server/telemetry-schema.ts), and the collector rejects anything else.

## What's never sent

No ID of any kind, so nothing links one day's message to the next. No idea names, quotes, session text, project or folder names, or paths. No exact counts of anything.

## How weekly users are counted without an ID

Your machine remembers, locally, whether it already sent a message this week and this month, and marks the first one. Adding up the marks gives weekly and monthly users. This is the technique [Brave describes for its usage ping](https://github.com/brave/brave-browser/wiki/Brave%E2%80%99s-Capture-of-Usage-Data).

## Where it goes

To a small collector we run on Cloudflare's free plan; its code is in [`telemetry/`](https://github.com/scintle/scintle/tree/main/telemetry). It adds 1 to that day's totals and throws the message away: no message is ever stored. Request logs are off, and it never reads your IP address or Cloudflare's location data. The totals are public, and any group smaller than 10 installs is hidden.

## Honest limits

- **"Anonymous", not "untraceable".** Cloudflare sees your IP address while delivering the message, as with any web request. We don't store it, but you have our word and our code for that, not a guarantee from physics.
- **The counts are estimates.** A reinstall, or using two machines, counts twice.
- **Only official releases send.** A copy built from the repo has no collector address and never sends.

## Check it, change it

- On the board: project menu, then **Usage sharing…** shows the next message, the last one sent, and an on/off switch.
- In Claude Code: `/scintle:telemetry`, `/scintle:telemetry enable`, `/scintle:telemetry disable`.
- `DO_NOT_TRACK=1` or `SCINTLE_TELEMETRY_DISABLED=1` keeps it off whatever you chose. It's also off in CI.
- `SCINTLE_TELEMETRY_DEBUG=1` writes the message to Scintle's log instead of sending it.

Turning it off deletes the local marks, so turning it on later starts again as a new install.

# Scintle

An idea board that keeps itself, with each idea's history behind every card.

Scintle reads your Claude Code sessions as you work and keeps every idea under a stable ID with a typed
history: renamed, narrowed, pivoted, spawned, merged, parked, released, dropped. The board sits in your
browser beside the terminal. You correct it when it's wrong; you never approve it event by event.

## Try it

Requires Node 22.13+ and Claude Code.

```sh
claude plugin marketplace add ~/Workspace/scintle
claude plugin install scintle@scintle-local
```

Then, in any Claude Code session:

- `/scintle` opens the board.
- `/scintle:sync` reads your recent sessions now instead of waiting for the next batch.
- `/scintle:plan I-001` loads an idea's brief (history, decisions, dropped approaches) and plans it.
- `/scintle:stop` stops the background server.

To build the board from your existing history once, before using it live:

```sh
npm run scintle -- import
```

This reads `~/.claude/projects`, uses your own `claude -p` for extraction, and writes only to
`~/.local/share/scintle/`.

## What it stores

A SQLite file at `~/.local/share/scintle/scintle.db`: the redacted text of your sessions while their
transcripts exist, and redacted quotes and excerpts for every event, kept after Claude Code deletes the
transcript. Nothing is sent anywhere except the extraction calls your own `claude` makes.

## Develop

```sh
npm install && (cd web && npm install)
npm run check              # typecheck, lint, unit tests
(cd web && npm run build)  # rebuild web/dist
(cd web && npx playwright test)
```

Specs and decisions live in `context/`.

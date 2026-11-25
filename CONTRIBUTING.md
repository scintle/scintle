# Contributing

Thanks for helping. Scintle is small on purpose; please open an issue before a large change.

## Set up

```sh
npm install && (cd web && npm install)
npm run check              # typecheck, unused code (knip), unit tests
(cd web && npm run build)  # rebuild web/dist, which is committed
(cd web && npx playwright test)
```

Try your copy in Claude Code with `claude --plugin-dir .`. To build the board from your history once:
`npm run scintle -- import`.

For screenshots and demos, never use real sessions: `SCINTLE_HOME=/tmp/demo CLAUDE_CONFIG_DIR=/tmp/empty
node --experimental-strip-types scripts/seed-demo.ts` makes a made-up history.

## Where things are

- `server/`: the local server and CLI (TypeScript run by Node, no runtime dependencies).
- `web/`: the board (React, d3, Vite).
- `site/`: the docs site (Astro, Starlight).
- `telemetry/`: the opt-in usage-count collector (a Cloudflare Worker).
- `context/`: the spec, data model, extraction rules and dated decisions. Read `context/decisions.md` before
  changing anything structural, and add a decision when you make a choice someone could undo.

## Rules

- A broken Scintle never breaks a session: hooks always exit 0, quickly.
- Redact before anything is stored or sent.
- Never write Claude Code's files or the user's config; read only `~/.claude` and folders the user added.

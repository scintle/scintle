# Scintle

An idea board that keeps itself, with each idea's history behind every card.

Read `context/` before changing anything structural:
- `context/spec.md`: what we build and for whom.
- `context/decisions.md`: dated decisions and why. Add one when you make a choice someone could undo.
- `context/plan.md`: milestones; update it as they land.
- `context/data-model.md`, `context/extraction.md`, `context/ui.md`: the three hard parts.

## Rules

- A broken Scintle never breaks a session: every hook exits 0 with a short timeout; work runs in `scintled`, never in the hook.
- Redact at construction. Anything persisted or sent to a model has passed `redact()`.
- Never write the harness's files or the user's config. We read `~/.claude`, plus only folders the user added (D25). Never scan the disk.
- Nothing past `server/ingest/` reads a vendor transcript format; it reads the skeleton.
- Inferred is shown as inferred. The user corrects; we never ask per event.
- No telemetry except D26: opt-in, no ID, a fixed published schema. No prices.

## Code

- Server: TypeScript on Node >=22.13, run with `--experimental-strip-types`, zero runtime dependencies.
- Web: React + d3 + Vite in `web/`; the built `web/dist` is committed.
- Comments: one or two factual lines; the why goes in `context/decisions.md`. No banners, no restating code.
- `npm run check` must pass before calling anything done.
- Never commit or push without an explicit yes for that action.

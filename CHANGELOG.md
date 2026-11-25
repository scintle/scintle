# Changelog

## 0.1.1

- Dropping an idea asks an optional "Anything to remember?" in your own words; it shows on the timeline.
- `/scintle:plan` briefs now include how the idea ended or paused (dropped, parked, released), with the reason.
- "Plan in a new session" in the plan dialog opens a terminal running `/scintle:plan` in the idea's folder (macOS Terminal, or `x-terminal-emulator` on Linux), and copies the command when it can't.
- Board links like `#idea=I-010` open that idea.
- Local endpoints for a Claude Code companion (find an idea by name or topic, read its history), token-protected like the rest; nothing calls them yet.
- `npx scintle install` is published to npm.

## 0.1.0 (beta)

The first public beta.

- An idea board built from your Claude Code sessions: stable IDs, typed history, lineage.
- Lineage (River and Constellation) with replay and scrubbing, and a lifecycle Board.
- Corrections with undo; drop reasons; questions instead of guesses on merges, pivots and revivals.
- Folders you add are read for plans and specs.
- `/scintle:plan` hands an idea's history to Claude's planner.
- Opt-in anonymous daily usage count, with no ID (D26).
- Help and feedback with copyable, redacted diagnostics.
- `/scintle:forget` deletes everything Scintle stored.

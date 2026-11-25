# Changelog

## Unreleased

- With an idea open, Replay plays just that idea's story, and the replay feed shows even with an idea open.
- The line under your prompt tells where an idea came from ("merged from …"), says "Pick it up" when you're coming back to one, and shows one line per story, not one for each parent.
- Fixes: dates in warnings were a day early west of UTC; decisions recorded with only a quote showed no text in the band and the line.

## 0.1.3

- Two commands: `/scintle` and `/scintle:plan` (`/scintle:dashboard` stands in for `/scintle` where Claude Code doesn't load mods). The rest are words after `/scintle`: `add`, `sync`, `stop`, `companion`, `telemetry`, `forget` (they were `/scintle:add` and so on).
- `/scintle:plan` on its own opens a picker of your ideas.
- The Claude Code companion ships in the plugin, on by default: Claude can look up an idea you name, a line under your prompt shows what it found, and it warns when you're about to repeat something you dropped. `/scintle companion off` turns it off.
- Usage sharing asks on a later day, not at first run, and says which features were used.
- Turning reading off now stops an import already running, before its next model call.
- Every model call runs with no tools, MCP servers, settings or hooks, and can't ask for more; a test holds this.
- Research is three calls: a web search, then reading only the pages that search returned (without your idea), then writing the report with no tools.
- The usage-sharing question is one short line.

## 0.1.2

- `/scintle` opens the board as written. It was only reachable as `/scintle:scintle`; it is now a skill, which Claude Code runs by its bare name. Claude never opens the board on its own.

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

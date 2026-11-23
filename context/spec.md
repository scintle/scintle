# Scintle: product spec

## Problem

Your ideas outlive your chats. A builder brainstorms in Claude Code across many sessions and days. Ideas get renamed, narrowed, pivoted, merged and dropped, and the story ends up scattered through transcripts that are deleted after 30 days.

## User

- **First:** the author, a solo builder juggling several ideas through Claude Code. Design from their history.
- **Target:** vibe coders, *if* v1 passes the me test.
- **Not now:** teams and work tickets; PMs whose ideas live in ChatGPT or claude.ai.

## Painkiller moments, most important first

1. **Coming back:** "Where was I on X, and what did we already try?"
2. **Handing off to planning:** a plan that knows the history doesn't repeat a dead end.
3. **Deciding:** which ideas deserve this week.
4. **Closure:** what became of everything. This one is a vitamin.

## Positioning guard

*An idea board that keeps itself, with each idea's history behind every card.*

If either half is lost, it becomes Trello or Backlog.md. Push back on any feature that mainly competes with:
- spec tools (Spec Kit, OpenSpec, BMAD, Hamster);
- agent kanbans;
- chat in the board (Remote Control already does that).

## Identity model

- An idea gets a minted ID at birth (`I-001`). Names and problems drift, so neither one is the key.
- **Same problem** (who hurts + what pain) keeps the same ID. This covers renamed, narrowed, widened, refined and decided, and variants inside one idea.
- **Problem changed** gets a new ID with a link:
  - **pivot** if the predecessor is replaced;
  - **spawn** if both are still alive.
- **Merge** gets a new ID with several parents. Merges are proposed, never applied automatically, because a false merge hides an idea.
- **Split:** the parent ends and the children spawn from it.
- **Narrowed** means a subset of the same people with the same pain. Anything else is a pivot.
- **Silence never means death.**

## Lifecycle

`seed → exploring → planned → building → released | dropped`, with `parked` possible from any stage.

- **Released and dropped** close the idea and freeze its history.
- **Revive** reopens the same ID.
- **Follow-ups** spawn new IDs.

## Friction rule

Correct, don't approve.

- Inferred events are drawn dotted until you confirm or correct them.
- Everything can be undone.
- At most one question per session.

## Helpers

- **Capture:** New Idea. No model.
- **Run:** a background `claude -p` job, such as Research. Its result becomes an event on the idea.
- **Hand off:** Plan implementation.
  - Scintle writes the brief: the problem now, its history, what was tried and dropped, quotes, and open questions.
  - The user's planner makes the plan. Plan mode is the default.
  - The plan returns as a `planned` event, linked to the brief's idea version.

## Sources

- Claude Code transcripts, through per-version parsers into Scintle's skeleton.
- Files those sessions write, such as reports.
- Quotes and excerpts are copied, redacted, into SQLite at extraction, so an event outlives its transcript.

## Me test (definition of done for v1)

Two weeks of real use. Pass if:
1. You open Scintle instead of scrolling old chats at least 3 times without being prompted.
2. Upkeep is a few corrections a week.
3. Most inferred stages and pivots are right.
4. At least once, a brief stops a plan from repeating a dead end.
5. You close an idea on purpose. This one is optional.

**Fail signal:** you stop opening it by week two.

## Out of scope for v1

- Telemetry.
- Teams and sharing.
- Harnesses other than Claude Code.
- ChatGPT and claude.ai importers.
- Push nudges.
- Obsidian or Notion export.
- A public release.
- Pricing.

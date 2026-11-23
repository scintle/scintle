# Decisions

Each entry has a date, the decision, and the reason. Add an entry when you make a choice someone could reasonably undo.

## D1 · 2026-11-22 · Idea-centred, not session-centred

**Decision:** the top-level things are ideas, each with a rundown and an interactive timeline. Sessions are evidence attached to them.

**Why:** the pain is losing *where an idea ended up*, not losing a chat.

## D2 · 2026-11-22 · Identity is a minted ID plus typed events

**Decision:** an idea gets an arbitrary ID when it's born. The events that change it are typed (see `spec.md`).

**Why:** names and problems both drift along a chain of changes, so neither can be the key.

**Precedents:** jj change IDs; TimeNets, where a merge gets a new ID.

## D3 · 2026-11-22 · Correct, don't approve

**Decision:** Scintle applies its best guess, draws it dotted, and lets you undo anything. At most one question per session.

**Why:** the user called approval cards for every event "crazy friction".

## D4 · 2026-11-22 · SQLite is the single source of truth

**Decision:** `node:sqlite` with WAL. A recursive CTE answers lineage queries.

**Why:** we need our own graph, and mem0 and claude-mem are optional inputs at most.

## D5 · 2026-11-22 · Copy redacted excerpts; archive whole transcripts only if the user opts in

**Decision:** quotes and context excerpts are copied, redacted, when they're extracted.

**Why:** Claude Code deletes transcripts after 30 days, and an event has to outlive its chat. This deliberately breaks vibesenpai's "never copy" rule; the user approved it for this project.

## D6 · 2026-11-22 · One background server (`scintled`)

**Decision:** the plugin's `SessionStart` hook starts a single local server if one isn't running. It binds to 127.0.0.1, requires a token, and shuts down when idle.

**Why:** New Idea has to work with no session open, background jobs have to survive closing a session, and one process should own SQLite. A per-session MCP server would fight over the port and die with the session.

## D7 · 2026-11-22 · React + d3 + Vite for the board

**Decision:** React renders the SVG; d3 does the scales, zoom and force-layout maths. The built `web/dist` is committed.

**Why:** React has better devtools and `useTransition`, and bundle size doesn't matter on localhost. Preact was considered and dropped.

## D8 · 2026-11-22 · Plan implementation, not Start

**Decision:** Scintle writes a brief that draws on the idea's history, and the user's planner makes the plan.

**Why:**
- Writing MVPs and specs is crowded (Spec Kit 151k stars, OpenSpec 75k, BMAD 55k, Hamster).
- The brief is the one thing only Scintle can write.
- No stable, flag-free way exists for an outside app to push into an open session. The user pulls the brief instead, with `/scintle:plan`.

## D9 · 2026-11-22 · Trigger the user's own `claude`, not the Agent SDK on their login

**Decision:** model calls run as `claude -p` child processes under the user's own login.

**Why:** Anthropic's terms bar third parties from routing requests through a user's Pro or Max credentials. Running the user's own binary is the safer reading. Re-check the billing terms before any public release.

## D10 · 2026-11-22 · Our own skeleton, behind per-harness parsers

**Decision:** parsers are chosen per harness and per version. Their output is normalised into Scintle's skeleton, and nothing downstream sees a vendor format.

**Why:** the transcript format is officially internal and can change without notice. The parser registry is adapted from vibesenpai.

## D11 · 2026-11-22 · Lean parser, adapted rather than copied whole

**Decision:** Scintle keeps vibesenpai's record handling: noise types, slash-command echoes, sidechain attribution, rewinds and file history. It drops what only the judge needs: argument and output digests, exit codes, failure kinds, tokens and cost.

**Why:** Scintle needs the full redacted text of turns and the files that were written, not failure forensics.

## D12 · 2026-11-22 · No supervisor module

**Decision:** jobs run as children of the long-lived `scintled` process. vibesenpai's `supervise/` lease machinery isn't copied.

**Why:** that machinery exists because vibesenpai has no long-lived process. Scintle has one.

## D13 · 2026-11-22 · Structured model output via `--json-schema`

**Decision:** extraction passes `--json-schema` to `claude -p`. We still validate the reply ourselves.

**Why:** the flag exists in Claude Code 2.1.330 (observed in `claude --help`, 2026-11-22).

## D14 · 2026-11-22 · The lineage canvas is d3-owned, ported from the v3 mock

**Decision:**
- River, Constellation, the time strip, zoom, fly-to, replay and the staged morph run as one d3 module (`web/src/lens/`) hosted by React.
- React keeps everything around the canvas.
- This revises D7 for the canvas only.

**Why:** the first React re-implementation lost the mock's visual language and transitions, and the user called the result clunky. Porting the mock's drawing code keeps what was already validated.

## D15 · 2026-11-22 · Board and Lineage are separate pages

**Decision:** tabs next to the brand switch between Board and Lineage. The River/Constellation switch shows only on Lineage.

**Why:** the user said the Board serves a different purpose (triage) from the lineage views (understanding how ideas evolved).

## D16 · 2026-11-22 · "Unsure" means low confidence, not merely inferred

**Decision:** an event or link is drawn faded and dashed only when it is inferred, unchecked, and below 0.6 confidence.

**Why:** almost everything is inferred, so marking every inferred item as unsure carried no signal.

## D17 · 2026-11-22 · Trimmed, single-round-trip model calls

**Decision:**
- `claude -p` runs with `--tools "" --strict-mcp-config --disable-slash-commands --setting-sources "" --no-session-persistence` and a short system prompt.
- The JSON schema goes in the prompt instead of `--json-schema`, and the reply is validated on our side.

**Why (measured 2026-11-22 on one real extraction segment, Sonnet):**

| Setup | Input tokens | Cost (Claude Code's own `total_cost_usd`) | Time |
|---|---|---|---|
| Default | 48,480 | $0.155 | 13.3 s |
| `--json-schema` plus trimmed flags | 42,664 | $0.116 | 16.6 s |
| Trimmed, single round trip | 19,928 | $0.095 | 11.2 s |

- Default `claude -p` carries about 29k tokens of Claude Code's own setup on every call.
- `--json-schema` takes two round trips, so the whole prompt is sent twice.
- The call stays on the user's own login, so `--bare`, which needs an API key, isn't used.

## D18 · 2026-11-22 · Batch live extraction, plus catching up on demand

**Decision:**
- Extract once a full segment (about 12k tokens) of new conversation has built up, at session end, or after 30 minutes idle.
- The person can force it with `/scintle:sync` or **Catch up** on the board. The user chose to offer both.

**Why (measured on 18 real sessions):**

| Trigger | Calls | Cost per call | Total |
|---|---|---|---|
| Every 90 s pause | ~594 | ~$0.023 | ~$14 |
| Batch | ~58 | ~$0.095 | ~$5.50 |

- About 2.5× cheaper.
- Each call also sees a whole stretch of conversation rather than one exchange. Inferred: better pivot-or-narrow decisions.

## D19 · 2026-11-22 · Re-reads never lose, duplicate or renumber an idea

**Decision:**
- **IDs come from a counter that only goes up** (`meta.next_idea`), so a deleted idea's number is never reused.
- **Each idea is anchored to its birth.** The anchor is the session and turn it was born at (`anchors`, which a reset never clears). A re-read births an idea within 6 turns of an anchor in the same session takes that anchor's ID back.
- **`--fresh` drops only inferred events and links.** Your corrections, stage moves, merges and the ideas you made stay. A correction whose inferred original is gone stays as a standalone event of yours.
- **Import and catch-up read segments from all waiting sessions in one queue ordered by time.** A failed segment holds back only its own session.
- **Each call sees the 3 turns before its segment** as context it can't quote.

**Why:** runs 1–3 renumbered ideas (Scintle was I-012, then I-006). Deleting the highest idea freed its number. Parallel sessions read one at a time could create the same idea twice. A segment boundary could cut a thought in half.

**Open:**
- A birth that moves more than 6 turns between runs gets a new ID.
- Two anchors equally close are resolved by order, not by asking.

## D20 · 2026-11-23 · An idea uses its project's own logo, otherwise one Claude draws

**Decision:**
- **Which repo an idea lives in:** a session run inside a git repo counts most. Otherwise, only files written within 10 turns of where the idea came up count. One session often touches several ideas, and counting the whole session wrongly gave four ideas Scintle's logo.
- **Which file is the logo:** in that repo, the most logo-like image (`mark` or `logo` over `icon` over `favicon`; SVG first; `brand/` and `public/` preferred). Framework art such as `react-logo` is skipped.
- **Otherwise, a logo Claude draws for the idea:**
  - one `claude -p` call per idea, after consent and within the daily cap;
  - saved as an SVG in the data dir; **New logo** asks for another;
  - the SVG is cut down to plain shapes and colours (no scripts, links, text or entities) and served with a sandboxing CSP;
  - the user rejected seeded constellation marks as ugly, and chose Claude over Stitch to keep the plugin free of a Stitch dependency.
- **Local only:** files are served only from the detected path.

## D21 · 2026-11-23 · Nothing is read with a model until the person says so

**Decision:**
- **The first screen asks.** **Start analyzing** reads the history plus new sessions, with the session count, model calls and minutes shown. **Only new sessions** skips the backfill. **Not now** does neither.
- **Before consent, nothing is stored or sent:** only session sizes are kept, no turn text, and there are no model calls.
- **`scintle import` counts as consent**, since a person typed it.

**Why:** the user asked for full transparency. Without this, the hooks would have started spending as soon as the plugin was installed.

## D22 · 2026-11-23 · Visual direction: Stitch's "Ultramarine Monolith", logo direction 02

**Decision:**
- **Colour and type:** deep surfaces, an ultramarine accent (#6467ff), and a violet spark gradient on primary buttons.
- **Board:** uppercase Bricolage column headers with count boxes; card surfaces with a divider above the metadata.
- **Panel and overview:** a tinted stage pill, a gradient lineage callout, events as cards on a gradient wire, and coloured status pills.
- **Logo:** direction 02, "Branching Track": a grey ancestral trail forks, and the active branch arcs up in ultramarine to a spark, on a dark squircle. (An earlier pass wrongly used the constellation, direction 03.)

**Why:** chosen by the user from a Stitch review run on synthetic demo data only. Real ideas never went to Google.

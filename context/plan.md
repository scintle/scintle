# Status (2026-11-22)

| # | State | Verified by |
|---|---|---|
| M0 | Done | `npm run check` green (77 tests) |
| M1 | Done | 33 real sessions. Prompt counts reconcile: 1,117 found by a direct jq count, minus 5 rewound turns, gives the parser's 1,112. That all 5 rewound turns were prompts is inferred. |
| M2 | Built; **your grading is pending** | Run 1: 39 ideas, about 20 of them vibesenpai features. Run 2, after tightening the rule: 17 ideas. Run 2 missed "Agent blame" and "Undo for agent actions"; a self-pivot bug was fixed and the bad event repaired. Grade with `npm run scintle -- ideas`. |
| M3 | Done | Smoke test: 401 without a token, 403 for a foreign Host, undo, brief, cookie, a hook with a bad path exits 0, stop. Hooks never wait: they post if the server is up, otherwise start it and exit. |
| M4 | Done | 7 Playwright flows pass; screenshots on run-2 data in both themes. At 200 ideas and 5,000 events: state fetch 17 ms, board ready 137 ms, scrub about 28 ms a frame. |
| M5 | Partly done | River (zoom, scrubber with ghosting) and Constellation (fit, collision-aware labels, drag-to-pin, path lighting) work. Not built: the staged morph, River's minimap, quotes at k ≥ 6. |
| M6 | Done, headless only | A real `claude -p` session with `--plugin-dir` created an idea through the hooks alone; `/scintle:plan` produced a linked `planned` event (brief v1) through the headless fallback. The plan-mode path is unit-tested against the record shapes in real 2.1.330 transcripts and older ones; **it has not been run live in an interactive session.** |
| M7 | Partly done | Done: deleted transcripts' turn text is purged; daily call cap (200) with "N calls" shown in the app bar. Not done: opt-in archive, the `cleanupPeriodDays` offer, a test of installing from the local marketplace. |

**Changed from the plan:**
- `supervise/` was not copied (D12).
- The parser is a lean adaptation of vibesenpai's, not the whole file (D11).
- Stages gained `evolved`, for an idea that continued as another ID.
- In headless mode the return path doesn't see plan mode, so it falls back to the reply after `/scintle:plan`.
- `scintle ideas` stands in for the planned `scintle eval` grading sheet.
- "Open in new terminal" (`claude-cli://`) was not built, because its link format hasn't been checked yet.

**Known open items:**
- Almost every card shows "inferred", so the signal carries little.
- Two test sessions (the "trail alerts" e2e runs) sit in `~/.claude/projects/` and will be imported unless they're removed.
- Research and ⌘K "Ask Claude" were built but never exercised against the real model.
- Installing from the marketplace may copy `node_modules` (vibesenpai shipped a `git archive` zip instead).

# Scintle: implementation plan (v1, "me test" build)

## Context

**The problem.** Ideas outlive the chats they started in. Scintle is "an idea board that keeps itself, with each idea's history behind every card."

**How it works.** It reads your Claude Code sessions as you work and keeps each idea under a stable ID with a typed history. The idea events are renamed, narrowed, pivoted, spawned, merged, parked, released and dropped. The board sits beside your terminal, in your browser, and you correct it rather than approve each change.

**What this build is for.** You use it on your own ideas for two weeks: the "me test". If it passes, it goes to vibe coders.

**What we already have.**
- The design work behind this plan: the identity model, the lifecycle, the v3 mock at claude.ai/artifact/RAEoWGHBAGSGuihmSMay6A, and four reports in `~/Workspace/reports/`.
- vibesenpai's transcript ingestion, which we reuse.

**Decided:**
- One background server, started by the plugin and kept up across sessions.
- React + d3 + Vite for the board.
- SQLite is the single source of truth.
- "Plan implementation", not "Start". Scintle writes the brief; your planner makes the plan.
- Per-harness, per-version parsers normalise into Scintle's *own* skeleton.
- Telemetry only as D26: opt-in, no ID, totals only.

**Code rules:** readable code with no bloat; comments only where the *why* isn't obvious.

## Beta readiness (replaces the me test, 2026-11-24)

The two-week me test was dropped: the author uses Scintle daily, and the next goal is a public beta. The beta plan
(R1–R6) lives in `~/.claude/plans/velvet-floating-gosling.md`; its status:

| # | What | State |
|---|---|---|
| R1 | Release zip (D27), Node check, Linux opener, `/scintle forget`, LICENSE, 0.1.0 | Done; zip installs cleanly into a throwaway Claude config |
| R2 | Cost on the consent screen, redaction test on a synthetic history, failure messages | Done |
| R3 | Opt-in usage count (D26): client, board question, `/scintle telemetry`, collector | Done; collector tested locally with wrangler; **deploying it is the owner's step** |
| R4 | Help and feedback with redacted diagnostics, issue templates | Done |
| R5 | Docs site (Astro + Starlight, terminal theme), landing page with the D28 pitch, README | Done locally; deploys on first push |
| R6 | CI (macOS + Linux), docs and release workflows | Written; **first run needs the GitHub org and a push** |

Still open: a clean-machine install test on a fresh macOS account and on Linux; the two "trail alerts" test
sessions in the owner's `~/.claude/projects`.

## Architecture

```
Claude Code session(s)                                 Browser board (React)
  hooks ─POST─▶ ┌─────────────────────────────┐ ◀─HTTP/SSE─┘
  /scintle cmds │ scintled (Node, 127.0.0.1)  │
  claude -p ◀───│  ingest → skeleton → extract│──▶ SQLite (WAL)
  (jobs)        │  ideas/events API, jobs     │   ~/.local/share/scintle/
                └─────────────────────────────┘
```

- **Server: `scintled`**
  - Plain `node:http`, run with `node --experimental-strip-types` (vibesenpai's pattern: no server build, zero runtime dependencies).
  - Binds to `127.0.0.1` on a fixed default port, with a fallback.
  - A random token lives in `~/.local/share/scintle/token` (mode 0600). Every route checks it; the board gets it once through the URL and then uses a cookie.
  - A pidfile plus a `/health` route handle "ensure running".
  - It shuts itself down after 6 h with no hook pings and no open board tabs (SSE clients).
- **Plugin**
  - `SessionStart` runs `scintle ensure`, which starts the server detached if it isn't running (`runDetached` pattern).
  - Hooks post `{session_id, transcript_path, cwd, event}` to the server. Every hook exits 0 and has a 2 s timeout.
  - Commands: `/scintle` (open the board), `/scintle:plan <idea>` (pull the brief into this session), `/scintle stop`.
- **Model calls**
  - The server runs `claude -p` as a child process on your own login (vibesenpai's `callModel` pattern).
  - Recursion guard: `SCINTLE_DISABLE=1` plus a marker working directory that ingest skips.
  - Extraction defaults to Sonnet and the model is configurable. A per-day call cap is shown in calls and minutes, never dollars.
- **Repo:** `~/Workspace/scintle`. npm, TypeScript 5.9 strict (vibesenpai's tsconfig flags, including `erasableSyntaxOnly`), Vitest, knip, Playwright for the board.

```
scintle/
  context/            AI-facing specs and plans (see below)
  .claude-plugin/     plugin.json, marketplace.json
  hooks/hooks.json
  skills/scintle/     SKILL.md: /scintle itself (a skill, so it runs bare, not as /scintle:scintle)
  commands/           plan.md, stop.md, …
  server/             strip-types TS, zero runtime deps
    ingest/           harness parsers → skeleton
    store/            schema, migrations, queries
    extract/          segmenting, prompt, apply (identity rules)
    jobs/             supervised claude -p runs
    http/             routes, SSE, auth
  web/                React + d3 + Vite → web/dist (committed; users never build)
  test/
```

## Reuse from vibesenpai (MIT; copy with a NOTICE line, no shared package yet)

- **Copy unchanged:** `src/redact.ts`, `src/files.ts` (`writeAtomic`), `src/normalise.ts`, `src/read.ts` (transcript discovery), `src/spawn.ts` (`runDetached`), `src/supervise/`.
- **Adapt:**
  - `src/parsers/index.ts` (`detectHarness`, `detectVersion`, `ParserRegistry`, `Provenance`).
  - `src/parsers/claude-code.ts`: drop the `fix-marker` import, `fixApplied` and `devCommand`. Make full-text capture a parameter instead of module state, because we need the full redacted prompt and answer text, not 200-character summaries.
  - `src/store.ts`: take only `openStore`, the `Db` type and `transact`.
  - `src/judge/model.ts`: `callModel` and `parseReply`.
- **New:** a `toSkeleton(events)` adapter, so nothing past ingest ever sees a vendor format.
- **Parser scope for v1:** Claude Code 2.1.x only, with the registry ready for Codex next. Tested versions come from vibesenpai's list.

## Scintle's own skeleton and data model (SQLite)

**Skeleton.** This is the only form extraction reads.
- `sessions(id, harness, harness_version, parser_match, cwd, project, started_at, ended_at, transcript_path, source_state)`
- `turns(session_id, seq, ts, role, text_redacted, tools_json, files_written_json)`
- Turn text stays only while the source transcript exists, unless you opt in to archiving. Excerpts on events are kept forever.

**Ledger.** Append-only events, with corrections stored as events too, so undo is free.
- `ideas(id 'I-001', title, problem, stage, created_at, closed_at)`. Title, problem and stage are cached projections of the events.
- `events(id, idea_id, type, ts, payload_json, confidence, origin: inferred|user, state: dotted|confirmed|removed, session_id, turn_seq, quote, context_excerpt, supersedes)`
- `links(id, from_idea, to_idea, type: pivot|spawn|merge, event_id)`. Lineage queries use a recursive CTE.
- `jobs(id, kind, idea_id, status, started_at, finished_at, output_path, error)`
- `briefs(id, idea_id, idea_version, created_at, body)`. Marker: `scintle:idea=I-042@v7`.

**Lifecycle:** seed → exploring → planned → building → released | dropped. Parked can happen at any stage.
- Released and dropped close the idea and freeze its history. Revive reopens the same ID.
- A follow-up becomes a new ID linked by a spawn.

## Extraction (the riskiest piece, so it is gated first)

1. **Segment.** After a `Stop` hook, with a 90 s debounce, take the new turns since the session's last processed `seq`.
2. **Build the prompt.**
   - Active ideas: ID, title, problem and latest version, plus closed ideas by title.
   - The segment: redacted user text in full, assistant text trimmed, file writes listed so reports attach automatically.
   - The identity rules: same problem keeps the same ID; a changed problem gets a new ID (pivot if the old one is replaced, spawn if both are alive); a merge gets a new ID with several parents; silence never means death.
3. **Call the model** with `claude -p --output-format json`. Validate the reply against a hand-written schema and drop anything invalid. (Check whether `--json-schema` exists in the current CLI and use it if so.)
4. **Apply.**
   - Every inferred event starts dotted.
   - Proposed merges are never applied automatically. They become one question, at most one per session.
   - Low-confidence pivot-or-narrow calls also become that question.
5. **Backfill.** `scintle import` runs the same pipeline over existing transcripts in time order. This doubles as me-test check 3 ahead of time.

The prompt and rules live in `context/extraction.md` and `server/extract/prompt.ts`.

## Board UI (React + d3 + Vite)

Port the v3 mock's behaviour into components, keeping what you liked and fixing the header properly.

- **App bar** (its own task). From left to right:
  - Scintle mark and wordmark;
  - project scope switcher;
  - the view switcher (Board · River · Constellation);
  - "Ask the board ⌘K";
  - **New Idea** as the primary button;
  - live indicator.
- **Board** (the new default view: your "idea board").
  - Lifecycle columns. Each card shows the title, a "where you left off" line, last activity, source-chat state, and a dotted outline while inferred.
  - Closed ideas sit in a collapsed shelf.
  - *Flag:* this adds a third view on top of the mock. Reject it in review if you'd rather open on River.
- **River** and **Constellation**, ported from `v3/logic.js`:
  - River: semantic zoom, scrubber with ghosting, minimap.
  - Constellation: seeded and pinned layout, collision-aware labels, depth slider.
  - Both: path lighting, and the staged morph between views.
  - d3 does the maths (`d3-scale`, `d3-zoom`, `d3-force`); React renders the SVG.
- **Idea panel**
  - The story: name path, problem now, lineage.
  - The interactive timeline from the mock (event cards, provenance, corrections, ←/→, undo toast).
  - Source-chat states: live, expiring, deleted (saved excerpt), or none.
  - Helpers by stage:
    - **Plan implementation:** the brief appears with two ways to start:
      - copy `/scintle:plan I-042` into your open session;
      - "Open in new terminal" via a `claude-cli://` deep link, where it's supported.
    - **Research** (a Run job): the result lands as a `researched` event with a link to the report.
    - **Park, Release, Drop, Revive.**
- **⌘K command bar.** Fixed phrasings first, then a `claude -p` fallback that returns view commands from a small command vocabulary.
- **Live updates.** A single SSE stream feeds a Zustand store, with optimistic corrections. React's `useTransition` keeps scrubbing and redraws smooth.
- **Quality bar:**
  - Tokens for light and dark themes; keyboard-first.
  - Reduced-motion support.
  - Empty, loading and error states for every panel.
  - Stays smooth with 200 ideas and 5,000 events.
- **Return path.** A hook spots the planner's output: the `ExitPlanMode` tool call in plan mode, or files a planner writes. It's logged as `planned`, with a link to the brief's idea version. After a later pivot, plans built on an older version show as out of date.

## Milestones (each ends in something runnable; you review at each gate)

| # | Deliverable | Gate |
|---|---|---|
| M0 | Repo, `context/` docs, tooling, CI script, copied vibesenpai modules with their tests passing | `npm run check` green |
| M1 | Ingest: parsers → skeleton → SQLite; `scintle import --dry-run` reports counts on your real `~/.claude/projects` | Counts match a direct line count of the transcripts; no secret leaks (redaction tests) |
| M2 | Extraction + apply engine; `scintle import` builds the ledger from your history; plain-text lineage report | **Go/no-go:** you grade the groupings, with false merges and false splits scored separately |
| M3 | `scintled`: lifecycle, auth, REST and SSE, job runner; `scintle ensure` / `stop` | Two sessions plus the board run with no port fight; it survives closing sessions; it idles out |
| M4 | Board UI: app bar, Board, idea panel, timeline, corrections and undo, New Idea, ⌘K | Playwright flows pass; manual pass in light and dark |
| M5 | River and Constellation ports, morph, scrubber, path lighting | Visual check against the v3 mock |
| M6 | Plugin: live hooks, commands, Plan implementation hand-off and return path, Research helper | End to end in a real session (see below) |
| M7 | Hardening: source-chat states, opt-in archive, offer to raise `cleanupPeriodDays`, performance with seeded large data, local marketplace install | Me test starts |

## `context/` folder (written in M0)

- `spec.md`: the product. Problem, user, me test, lifecycle, identity rules, friction rule, out-of-scope list.
- `decisions.md`: dated decisions with their reasons, carried over from the brainstorm.
- `plan.md`: this plan, kept current as milestones land.
- `data-model.md`: the skeleton and ledger schema, and the event vocabulary.
- `extraction.md`: the prompt, the rules, and the grading method.
- `ui.md`: views, interactions, tokens, and the parts of the mock being ported.
- `research.md`: links to the reports in `~/Workspace/reports/`, with one-line takeaways.

## Out of scope for v1

- Telemetry beyond D26's opt-in daily count.
- Teams and sharing.
- Codex and other harness parsers. The registry is ready for them.
- ChatGPT and claude.ai importers.
- Push nudges (Channels or monitors).
- Obsidian or Notion export.
- A public npm or marketplace release.
- Pricing.

## Verification

- **Unit tests (Vitest):**
  - parser fixtures, built inline per tested version;
  - `toSkeleton`;
  - redaction;
  - the apply engine's identity rules: rename keeps the ID, pivot gets a new ID and a link, a merge is proposed and never applied, undo restores;
  - lifecycle projection.
- **Corpus check:** `npm run verify:corpus` (copied from vibesenpai) checks that parse counts stay stable on the pinned public transcripts.
- **Extraction eval:** `scintle eval` runs on your history and writes a grading sheet (`context/eval/`), recording the false-merge and false-split rate per run.
- **Board (Playwright):**
  - New Idea creates a seed;
  - opening an idea shows its timeline;
  - correcting an event, then undoing it;
  - ⌘K "where did X end up";
  - scrubbing to a past date;
  - the copy flow for Plan implementation;
  - SSE live update when a test event is posted.
  - Screenshots in both themes.
- **End to end by hand:**
  1. Install the plugin from the local marketplace.
  2. Start a Claude Code session and brainstorm an idea; it appears dotted within about 2 minutes.
  3. Rename it in chat; the ID stays the same.
  4. Run `/scintle:plan`; plan mode gets the brief; the `planned` event shows on the timeline.
  5. Close all sessions; the board still loads, and the server idles out later.
- **Commits:** none without your explicit yes for each one.

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

## D23 · 2026-11-23 · Plans and specs saved as files are a source

**Decision:**
- **What's read:**
  - `~/.claude/plans/`;
  - inside repos the user's sessions worked in, plan-like folders (`plans`, `specs`, `context`, `rfcs`, `adr`, `decisions`, `proposals`) and plan-like files (`PLAN.md`, `SPEC.md`, `ROADMAP.md`, …);
  - for sessions run outside any repo, that folder's `reports`, `plans`, `specs`, `docs` and `notes`.
- **What's skipped:**
  - Claude's own files under `~/.claude` (memory, settings);
  - `commands`, `skills` and `memory` folders;
  - any document a transcript still on disk wrote, because that conversation already carries its story.
- **How it's read:** each document is a one-turn session holding a digest (title, headings, each section's opening, no code, capped at 8k characters), so a long report costs one call. It's dated by file creation, read once, and read again only when the file changes.

**Why:** documents outlive the 30-day transcript cleanup.

**Measured on the user's machine:** 44 documents found, 19 already covered, 25 calls. The board went from 11 to 18 ideas; "Agent blame" came back as "Agent code rationale tracking".

**Not yet:** prompt history (`~/.claude/history.jsonl`). The plan is to read only periods with no transcript, skip short prompts, and make one call per day of activity. Measure before running.

## D24 · 2026-11-23 · Ended ideas carry a reason

**Decision:**
- Ended ideas get a resolution: released, pivoted, merged, not interested, crowded market, no real demand, not feasible, other. This is the Jira or Linear pattern.
- **Who sets what:**
  - released, pivoted and merged are detected;
  - **"Not interested" is only ever set by the person**: the model's attempts are rewritten to "other";
  - the model may suggest crowded, no demand or not feasible.
- **Where it shows:** as pills, and as a reason filter under the Ended chip.

**Why:** the user wanted to dismiss ideas they never wanted (such as research shortlist candidates) without calling it a drop, and to see why ideas ended.

## D25 · 2026-11-23 · Scintle reads only Claude's folder unless the person adds one

**Decision:**
- Scintle always reads `~/.claude`: transcripts, `~/.claude/plans`, and prompt history once that's built.
- Anything else on disk is read only from folders the person adds, like opening a folder in an editor. They add one with "Folders Scintle reads…" in the project menu, or `/scintle:add` run inside the folder.
- There is no automatic discovery of repos or work folders, including from session working directories and written files. This supersedes D23's discovery.
- Logo detection (D20) also looks only inside added folders.
- **What's read in an added folder:** top-level Markdown (minus boilerplate such as CHANGELOG, LICENSE, CLAUDE.md), plan-like folders, and plan-like file names anywhere. A generic `docs/` folder is not read wholesale.
- **Removing a folder** forgets its document text; ideas and their events stay. A document that no longer matches and was never sent to the model is dropped.
- The folders the earlier automatic reader had used were listed once, so the person can see and remove them.

**Why:** the user raised that scanning beyond Claude's own folder is a privacy breach. No reliable "workspace" exists to find anyway.

**Cost:** a thinner first board for people who keep plans in their repos. Project names in the menu still come from where transcripts ran, which is Claude's own record and not a disk scan.

## D26 · 2026-11-24 · Opt-in daily usage count, with no ID and only totals kept

**Decision:**
- **Off until the person says yes.** The board asks once ("Share an anonymous daily usage count?"), linking to the exact message. Ignoring the question counts as no. `DO_NOT_TRACK`, `SCINTLE_TELEMETRY_DISABLED=1` or `CI` override a yes.
- **What's sent:** at most one message per UTC day, sent by `scintled` (never by hooks or the board page), with a 3 s timeout and no retry. These fields and nothing else:
  ```json
  { "schema": 1, "event": "daily_active", "version": "0.4", "os": "darwin", "arch": "arm64",
    "new_install": false, "first_this_week": true, "first_this_month": false, "install_month": "2026-10" }
  ```
  - `version` is major.minor only;
  - `os` and `arch` come from fixed lists;
  - `install_month` stops being sent after 6 months.
- **No ID.** Each machine keeps its own marks: first message ever, first this ISO week, first this month (Brave's usage-ping technique). Daily users = messages that day; weekly and monthly users = the sums of those marks. A local `last_ping_date` plus a lock stops a second message on the same day.
- **The collector keeps totals only:** a first-party Cloudflare Worker on the free plan, with code in this repo.
  - Each message adds 1 to that day's counters in D1, split by version, OS, arch and install month; the message itself is never stored.
  - Logging is off. The IP, headers and Cloudflare's location data are never read or stored.
  - Bodies over 1 KB, and values outside the published lists, are rejected.
- **A public page of totals** that hides any group under 10 installs.
- **Anyone can check it:**
  - `scintle telemetry status|enable|disable`; disabling deletes the local marks;
  - `SCINTLE_TELEMETRY_DEBUG=1` prints the message instead of sending it;
  - the board shows the last message sent;
  - the schema is one file in the repo, and a test fails if the client and Worker disagree;
  - the endpoint is built into releases only, so a clone never sends anything.
- **Changing the schema** means a new `schema` number and asking again.

**Why:**
- The user wants very high-level usage numbers without tracking anyone. People keep private ideas in Scintle, so they may object to any kind of tracking.
- Opt-in follows Go's lesson with privacy-minded developers.
- First-party collection follows Audacity's and Homebrew's lesson: the backlash was about third-party analytics.
- Keeping totals only means we never hold one person's message.
- On the free plan, a flood costs a day of counts, never a bill.

**Cost:**
- Few people will opt in (Go got about 1,800 a week against a target of about 16,000), so the numbers describe a keen subset.
- Counts are close estimates: a reinstall or a second machine counts twice.
- Only the questions we set up tallies for can be answered later.
- Cloudflare still sees each sender's IP on the way in, so the docs must say "anonymous", never "untraceable".

**Open:**
- Whether D1's EU location option works on the free plan.
- A lawyer's read on EU ePrivacy Art. 5(3) before inviting EU users at scale.

Research: `~/Workspace/reports/Privacy first telemetry for Scintle.md`.

## D27 · 2026-11-24 · Data stays in `~/.local/share/scintle`; releases ship as a zip

**Decision:**
- **Data folder:** Scintle's database stays in `~/.local/share/scintle` (or `$XDG_DATA_HOME/scintle`, or `SCINTLE_HOME`), not Claude Code's `${CLAUDE_PLUGIN_DATA}`.
  - Uninstalling the plugin leaves this folder in place.
  - `scintle forget --yes` deletes it, and only if it holds Scintle's files.
- **Releases:** each release is a zip attached to a GitHub release, built by `scripts/build-release.sh` (vibesenpai's D69 pattern). `marketplace.json` points at it with an `archive` source pinned by sha256.
  - The zip holds the runtime files plus a four-line `package.json`.
  - It has no lockfile and no dev dependencies, so Claude Code installs nothing extra.
- **Launcher:** hooks and commands run `server/run.mjs`, which is plain JavaScript.
  - It checks for Node 22.13 or newer before loading any TypeScript.
  - An old Node gets a sentence, and a missing Node gets a SessionStart message, instead of failing silently.

**Why:**
- **Data folder** (research 2026-11-24): tools that keep data people can't get back (claude-mem, episodic-memory, Claude Code UI, Crystal, Vibe Kanban, Claude Code itself) all keep it in a home folder they own.
  - `${CLAUDE_PLUGIN_DATA}` is documented for caches and `node_modules`, and is deleted on uninstall.
  - It is also named per plugin@marketplace, so a dev install and a release install would see different stores.
- **Zip:** an install from the repo would copy dev files, and a lockfile can trigger an automatic npm install.

**Cost:**
- Uninstalling leaves data behind until `scintle forget` is run; the docs say so.
- The missing-Node message repeats at every session start until Node is installed.

## D28 · 2026-11-24 · The pitch: "Your AI chats, turned into a history of your ideas."

**Decision:**
- **Hero line:** "Your AI chats, turned into a history of your ideas."
- **Subhead:** it keeps each idea's story, how it started, changed and ended up, so you can pick any idea back up where you left it.
- **Kept general on purpose:** the pitch doesn't name Claude Code.
- **Internal guard:** "An idea board that keeps itself, with each idea's history behind every card" stays as the positioning guard in `spec.md`.

**Why** (research 2026-11-24, `~/Workspace/reports/Scintle pitch angle.md`):
- Plain headlines that name what goes in and what comes out beat clever or emotional ones for developer tools.
- Builders' own words are about picking up where they left off and hating manual tracking, not rediscovery or nostalgia.
- "Amazing" was dropped as the marketing language HN discounts.

**Not chosen as the headline:**
- Rediscover, keep track and nostalgia had the weakest evidence among experienced developers.
- Loss ("your ideas outlive your chats") is kept for the subhead and launch story: Scintle keeps ideas, not transcripts.

**Open:** the evidence covered HN and GitHub only, so vibe coders are untested. The beta headline test compares this line with one emotional variant ("Whatever happened to that idea?").

## D29 · 2026-11-24 · `npx scintle install` is the default install command

**Decision:**
- The docs and landing page lead with `npx scintle install`.
- The npm package (`npm/`, name `scintle`, free on npm as of 2026-11-24) holds no plugin code. It:
  - checks for Node 22.13+ and Claude Code 2.1.292+;
  - prints Claude Code's own install command;
  - asks `[y/N]`, then runs that command.
  - With no terminal attached it runs only with `--yes`.
- No postinstall script, and the package writes nothing itself.
- **Fallbacks:** `claude plugin install scintle --marketplace scintle/scintle`, or `/plugin` inside Claude Code.

**Why:**
- It's short and doesn't name a harness, which fits D28's generic pitch.
- It's vibesenpai's D74 pattern, already used there, including the test suite (`test/npm-install.spec.ts`).

**Cost:**
- One more thing to publish on every release, and an npm account to own the name.
- Publishing is the owner's step.

## D30 · 2026-11-24 · Handing an idea to Claude: a pointer, a lookup, and a new session

**Decision:**
- The server answers four local, token-protected routes: `/api/context` (ideas a prompt names), `/api/search`, `/api/history/:id` and `/api/card/:id` (`server/handoff.ts`).
- A prompt that names an idea gets a one-line **pointer**, never the brief. The model decides whether to read the history.
- Names match only outside paths and URLs; IDs only outside quotes and code; titles need two words or eight letters. Each idea is pointed at once per session.
- "Plan in a new session" opens a new terminal running `claude "/scintle:plan I-xxx"` in the folder the idea was last worked in. On failure it copies the command.
- Briefs include lifecycle events with the drop reason and the person's own why.
- Dropping asks an optional why.

**Why:**
- Copy and paste was the hand-off's friction, and several sessions may be open, so "the prompt box" is ambiguous; a new session is not.
- On 936 real prompts the matcher fired on 15 (1.6%); about 12 were about the idea (`scripts/eval-match.ts`). A pointer costs one line when it misfires; a brief would cost hundreds.
- A drop reason alone ("not interested") told Claude nothing a month later.

**Cost:**
- The companion that calls these routes is a Claude Code mod prototype outside this repo; until it ships, the routes are unused.
- The new-session button drives Terminal.app through AppleScript, which asks for macOS automation permission the first time and ignores other terminals.

## D31 · 2026-11-25 · What leaves the machine: no tools by default, a "no" stops the next call, Research split in three

**Decision:**
- Every `claude -p` call runs with `--permission-mode dontAsk`, no tools unless granted, `--strict-mcp-config`, `--setting-sources ''`, no slash commands and no saved session (`modelArgs` in `server/lib/model.ts`). `test/egress.spec.ts` holds these flags. It also fails if any file other than the research job grants a tool.
- Extraction checks consent before every model call, not once per run. A "no" mid-run stops before the next call, and the unread session stays unread.
- Research is three calls:
  1. **Search:** WebSearch only, with the brief.
  2. **Read:** WebFetch only, bound by `WebFetch(domain:…)` to the hosts of URLs that appeared in the search tool's own results (read from the stream). No brief, and fixed questions.
  3. **Write:** no tools, with the brief and the notes (redacted).

**Why:**
- A reviewer of vibesenpai on awesome-claude-code-mods (PR 552, 2026-11-25) found two leaks:
  - revoking model reads didn't stop a pass already running;
  - `--allowed-tools ''` left the built-in tools and MCP in place.

  Scintle had the second right, but had the first bug.
- WebFetch in the same call as the idea let a page's injected instructions carry idea text to any URL. Splitting the calls leaves nothing private in the call that reads pages.
- Taking URLs from the search results stops the model inventing one with idea text in its path.
- Tested 2026-11-25 with `claude -p`:
  - a host outside the rules was refused and reported in `permission_denials`;
  - a cross-host redirect was not followed;
  - a full run took 3 calls and 60 s.

**Cost:**
- Research takes 3 calls instead of 1.
- Pages behind a cross-host redirect go unread.
- Search queries still carry words from the idea, which is inherent to searching.

**D26 addendum (2026-11-25): schema 2 adds `used`, and the question waits for a later day.**
- **`used`:** yes or no for nine features since the last message: board, lineage, replay, plan, research, ask, correct, triage and new_idea.
  - They're noted locally only while sharing is on, and cleared on each send. The server routes mark them; only Lineage and Replay are reported by the board (`POST /api/used`).
  - The collector keeps one counter per feature per day, and the public page hides any under 10.
  - **Why:** one message a day says only "installed and running". The owner needs to know which features are used, without per-event messages, which would put working times on the wire.
- **Asking:** the question appears on the first board open on a later day than the first, alone on screen: no import running, no other question.
  - **Why:** asking before the board had filled asked for trust before Scintle had earned any.
- **Schema 2:** a changed schema asks again. Nobody had sent schema 1, since no release carried an endpoint before this.
- **D1 caps compound SELECTs below SQLite's default.** The feature totals are one row of sums, and the local `node:sqlite` tests don't catch such limits, so every collector change gets a request against the deployed Worker.

## D32 · 2026-11-25 · The companion ships inside the plugin, on by default

**Decision:**
- The Claude Code companion (D30's client) is a hooks module in the Scintle plugin: `hooks/companion.tsx`, listed under `modules` in `hooks/hooks.json` beside the classic hooks, and typed by `types/companion.d.ts`.
- What it does:
  - points Claude at an idea a prompt names;
  - gives Claude `search_ideas` and `idea_history`;
  - when Claude reads an idea, draws one line under the prompt with the idea's most telling fact and a button to the board;
  - suggests `/scintle:plan` after a turn about one idea.
- **On by default.** `/scintle:companion off` turns it off: no tools are registered, and the server answers no pointers.
- It also stays silent until reading is allowed on the board (D21).
- Telemetry gains `companion`: Claude looked up an idea through it.

**Why:**
- The adoption research put the hook in chat, not on the board.
- Claude Code's own docs (mods overview, read 2026-11-25): "Mods are on by default", and a plugin's `hooks.json` may hold classic hooks and `modules` together.
- Tested 2026-11-25: one plugin ran a classic SessionStart hook and a module in the same session.

**Cost:**
- Idea names reach Claude in ordinary chats, and the history too when Claude looks it up. The privacy page says so.
- Mods need Claude Code 2.1.287+. They don't load in an untrusted folder, under policies that block plugin hooks, or with `--safe-mode`. The classic hooks keep working there.
- The engine writes a `tsconfig.json` into a hot-loaded plugin folder, so development loads `scripts/stage-plugin.sh`'s copy, never the repo.
- `npm run check:companion` validates and tests the mod. It needs the `claude` CLI, so CI doesn't run it yet.


## D33 · 2026-11-25 · The dead-end guard: Claude judges, the board supplies the evidence

**Decision:**
- In the history the companion gives Claude, each dropped approach and dropped idea is tagged `[#event id]`. The history then tells Claude to call `flag_dead_end` only when the user proposes, or Claude is about to plan, a real repeat. `/scintle:plan` briefs stay untagged.
- `flag_dead_end(event_id)` asks the server (`GET /api/dead-end/:id`), which answers only for a live `tried` event with outcome `dropped`, or a `dropped` event.
- The line under the prompt is built from that record: the approach, the date and the person's reason. It's an amber ⚠ with a **See why** button.
- Each id is shown once per conversation.

**Why:**
- A false "you tried this before" costs more than silence. The model that sees the whole conversation judges best whether a proposal repeats a dead end, and it adds no model calls.
- Building the line from the board means Claude can point at evidence but can't write it. An id that isn't a dead end is refused.
- Tested 2026-11-25 with `claude -p` on the owner's real board (5 dropped approaches, all in one idea):
  - a dropped approach proposed again was flagged (#220);
  - a related approach that had been kept was not;
  - a passing mention didn't even trigger a history lookup.

**Cost:**
- It only works when Claude has read the idea's history in that conversation.
- Its judgment is the model's, so a miss stays possible; the record it shows can't be wrong.

# Data model

The SQLite database lives at `$SCINTLE_HOME` (default `~/.local/share/scintle/`) in `scintle.db`, mode 0600, with WAL on.

## Skeleton (written by ingest; read by extraction)

The harness-neutral form of a session. Text is redacted before it's stored.

```
sessions(id PK, harness, harness_version, parser, parser_match,
         project, cwd, transcript_path, started_at, ended_at,
         bytes_read, turns_extracted, source_state)
turns(session_id, seq, ts, role, text, files_written, PRIMARY KEY(session_id, seq))
```

- `role`: `user` (a human prompt), `assistant` (text Claude said), or `command` (a slash command the user ran).
- Tool calls aren't turns. A file written or edited goes into `files_written` (JSON array) on the assistant turn that wrote it.
- Not ingested: subagent (sidechain) records, and turns on a rewound branch. Neither is the user's own line of thought.
- `bytes_read`: how far into the transcript ingest has read, so the next pass resumes from there.
- `turns_extracted`: the highest `seq` extraction has seen.
- `source_state`: `live`, `deleted` or `archived`.
- Turn text is deleted once the transcript is gone, unless the user opted in to archiving. Event excerpts are kept.

## Ledger

Events are append-only. A correction is a new event that `supersedes` an earlier one, so undoing it means removing the correction.

```
ideas(id PK 'I-001', title, problem, stage, created_at, updated_at, closed_at)
events(id PK, idea_id, type, ts, payload, confidence, origin, state,
       session_id, turn_seq, quote, excerpt, supersedes, created_at)
links(id PK, from_idea, to_idea, type, event_id)
briefs(id PK, idea_id, idea_version, body, created_at)
jobs(id PK, kind, idea_id, status, started_at, finished_at, output_path, error)
questions(id PK, idea_id, kind, payload, session_id, state, created_at)
calls(id PK, ts, kind, ok, input_tokens, output_tokens, duration_ms)
meta(key PK, value)              -- next_idea: the counter IDs come from (D19)
anchors(idea_id PK, session_id, turn_seq)  -- where each idea was born; kept across re-reads (D19)
```

- `ideas` holds a projection: title, problem and stage are recomputed from the live events whenever an event changes.
- `origin`: `inferred` (the model proposed it) or `user` (clicked, typed or corrected).
- `state`:
  - `dotted`: inferred and not yet looked at;
  - `confirmed`: the user kept it, or the user made it;
  - `removed`: the user dismissed it.
- `confidence`: 0–1, set only on inferred events.
- `idea_version`: the number of live events on that idea when the brief was written. Marker: `scintle:idea=I-042@v7`.

## Event vocabulary

| type | identity effect | payload |
|---|---|---|
| `born` | mints the ID | `{title, problem}` |
| `renamed` | same ID | `{from, to}` |
| `narrowed` | same ID | `{problem}`: a subset of the same people with the same pain |
| `widened` | same ID | `{problem}` |
| `refined` | same ID | `{note}` |
| `decided` | same ID | `{decision}` |
| `tried` | same ID | `{approach, outcome: kept\|dropped, why}` |
| `pivoted` | ends this ID; the new ID's `born` links back | `{to}` |
| `spawned` | both stay alive; the new ID's `born` links back | `{to}` |
| `merged` | ends every parent; the new ID links to each | `{into}` |
| `researched` | same ID | `{report}`: a path or a job output |
| `planned` | same ID; stage moves to planned | `{brief, plan}` |
| `building` | same ID; stage moves to building | `{evidence}` |
| `parked` / `resumed` | stage | `{why}` |
| `released` / `dropped` | closes the idea | `{why}` |
| `revived` | reopens the idea | `{why}` |
| `attached` | same ID | `{file}`: a report or doc written in a session |

**Stage projection:**
- `seed` at birth;
- `exploring` once any later event exists;
- `planned` and `building` from those events;
- `parked`, `released` and `dropped` set and clear the stage directly, and `revived` restores the last open stage.

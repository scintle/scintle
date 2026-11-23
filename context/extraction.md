# Extraction

Extraction turns new skeleton turns into ledger events. It is the riskiest piece of Scintle, so it's gated at M2: the user grades the groupings on their own history before any UI is built on top.

## Trigger (D18)

- **Every `Stop` and `SessionEnd` hook:** the transcript is ingested right away. Ingesting is cheap and makes no model call.
- **Extraction (one model call per segment) runs in batches, when any of these happens:**
  - about 12k tokens (one full segment) of new conversation has built up in a session;
  - the session ends;
  - the session has been idle for 30 minutes;
  - the person asks: `/scintle:sync`, or **Catch up** in the app bar, which shows how many sessions are waiting.
- **Backfill:** `scintle import` runs every session in time order, through the same code path.
- **Daily cap:** 200 calls; the app bar shows the calls, tokens and minutes used today.

## Segment

Take the turns after `turns_extracted`, up to about 12k tokens per call; a longer session is split into several calls.

- User text is sent in full.
- Assistant text is trimmed to its first and last 600 characters.
- Written files are listed by path.

## Prompt contents

1. The identity rules from `spec.md`, word for word, with two worked examples:
   - a narrowing that keeps the ID;
   - a pivot that mints a new one.
2. The active ideas: ID, title, problem, stage, and the last three events. Closed ideas appear by title only.
3. The segment, with each turn labelled `[seq]` so evidence can be cited.

## Output

JSON, enforced with `--json-schema` and validated again on our side.

```
{ "events": [ { "idea": "I-004" | "new:1", "type": "...", "payload": {...},
                "confidence": 0.0-1.0, "seq": 12, "quote": "..." } ],
  "new_ideas": [ { "ref": "new:1", "title": "...", "problem": "..." } ],
  "question": null | { "idea": "...", "kind": "merge|pivot-or-narrow|alive", "text": "..." } }
```

## Apply rules

These are enforced in code, not trusted to the model.

- Drop an event if:
  - it names an unknown idea;
  - its type isn't in the vocabulary;
  - its seq isn't in the segment;
  - its quote isn't a substring of that turn's text.
- `merged` is never applied. It becomes a question.
- A `pivoted` or `narrowed` event with confidence below 0.6 is applied as dotted, and a pivot-or-narrow question is raised.
- At most one open question per session. Later ones are dropped, never stacked on screen.
- The excerpt stored with an event is the cited turn plus one turn either side, redacted and capped at 1,200 characters.
- Small talk and tooling chatter produce no events. Returning nothing is a valid answer.

## Model

Defaults to `sonnet`; set with `SCINTLE_MODEL`. The call is trimmed and takes one round trip (D17): `claude -p --output-format json --tools "" --strict-mcp-config --disable-slash-commands --setting-sources "" --no-session-persistence --system-prompt …`, with the schema in the prompt and the reply validated by `sanitize`:
- the prompt goes in on stdin;
- the working directory is under `$TMPDIR/scintle-run`, which ingest skips;
- `SCINTLE_DISABLE=1` is set so our own hooks don't fire inside it.

The daily call cap defaults to 200 calls. It's shown in the UI as calls used, never as a price.

## Grading (M2 gate)

`scintle ideas` prints every idea with:
- its chain of names;
- its links to other ideas;
- each event with its confidence and quote, and the session and turn it came from.

That list is the grading sheet for now. A separate `scintle eval` command that writes a file to mark up is not built. Count false merges (two ideas wrongly put together) and false splits (one idea wrongly split apart) separately; a false merge is the costlier error.

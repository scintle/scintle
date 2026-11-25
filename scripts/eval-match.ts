/**
 * How often the companion's prompt pointer would fire on real history, and how often the matched idea is one the
 * session actually changed (a proxy for "this prompt is about it"). Read-only: run it on a copy of the database.
 * Usage: node --experimental-strip-types scripts/eval-match.ts <copy-of-scintle.db>
 */

import { DatabaseSync } from 'node:sqlite';
import { contextFor } from '../server/handoff.ts';
import type { Db } from '../server/store/db.ts';

const raw = new DatabaseSync(process.argv[2] ?? '', { readOnly: true });
const db = raw as unknown as Db;
const prompts = raw.prepare(
  `SELECT t.session_id AS s, t.text FROM turns t JOIN sessions x ON x.id = t.session_id
   WHERE t.role = 'user' AND x.harness != 'doc' AND length(t.text) > 0 AND substr(ltrim(t.text), 1, 1) != '/'
   ORDER BY t.session_id, t.seq`,
).all() as { s: string; text: string }[];
const changed = raw.prepare('SELECT 1 FROM events WHERE session_id = ? AND idea_id = ? LIMIT 1');

let fired = 0, pointers = 0, relevant = 0;
const seen = new Map<string, string[]>();
const passing: string[] = [];
for (const p of prompts) {
  const skip = seen.get(p.s) ?? [];
  const { ideas } = contextFor(db, p.text, skip);
  if (ideas.length === 0) continue;
  fired++;
  for (const i of ideas) {
    pointers++;
    skip.push(i.id);
    if (changed.get(p.s, i.id) !== undefined) relevant++;
    else if (passing.length < 10) passing.push(`${i.id} ← "${p.text.replace(/\s+/g, ' ').slice(0, 120)}"`);
  }
  seen.set(p.s, skip);
}
console.log(`prompts ${prompts.length} · pointer fired on ${fired} (${((100 * fired) / prompts.length).toFixed(1)}%) · ${pointers} pointers`);
console.log(`about an idea the session changed: ${relevant} of ${pointers} (${((100 * relevant) / Math.max(1, pointers)).toFixed(0)}%)`);
if (passing.length > 0) console.log(`no change to that idea in the session (check by eye):\n  ${passing.join('\n  ')}`);

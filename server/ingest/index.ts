/** Transcripts on disk → skeleton rows. Re-parses a file only when its size or mtime changed. */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { OWN_RUN_MARKERS } from '../lib/config.ts';
import { transact, type Db } from '../store/db.ts';
import { parse, type ParseResult } from './parsers/index.ts';

export function discover(roots: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.jsonl') && !p.includes('/subagents/') && !OWN_RUN_MARKERS.some((m) => p.includes(m))) out.push(p);
    }
  };
  for (const r of roots) walk(r);
  return out;
}

export type IngestOutcome = { path: string; status: 'unchanged' | 'ingested' | 'empty'; result?: ParseResult };

/**
 * `withText: false` (before consent, D21) records only a session's size and an estimate of what reading it
 * would cost; no turn text is stored. A later run with text fills it in even if the file is unchanged.
 */
export function ingestFile(db: Db, path: string, opts: { dryRun?: boolean; withText?: boolean } = {}): IngestOutcome {
  const withText = opts.withText ?? true;
  const st = statSync(path);
  const id = basename(path, '.jsonl');
  const prev = db.prepare('SELECT size, mtime, text_stored FROM sessions WHERE id = ?').get(id) as
    | { size: number; mtime: number; text_stored: number }
    | undefined;
  const unchanged = prev !== undefined && prev.size === st.size && prev.mtime === st.mtimeMs;
  if (unchanged && (prev.text_stored === 1 || !withText)) return { path, status: 'unchanged' };

  const text = readFileSync(path, 'utf8');
  // The harness may be mid-write: ignore a partial last line.
  const complete = text.slice(0, text.lastIndexOf('\n') + 1);
  const result = parse(path, complete, id);
  if (result.turns.length === 0) return { path, status: 'empty', result };
  if (opts.dryRun === true) return { path, status: 'ingested', result };

  const est = result.turns.some((t) => t.role === 'user')
    ? result.turns.reduce((a, t) => a + Math.min(t.text.length, t.role === 'assistant' ? 1240 : Infinity) + 40, 0)
    : 0;
  const first = result.turns.find((t) => t.ts !== undefined)?.ts ?? null;
  const last = result.turns.findLast((t) => t.ts !== undefined)?.ts ?? null;
  transact(db, () => {
    db.prepare(
      `INSERT INTO sessions (id, harness, harness_version, parser, parser_match, project, cwd, transcript_path,
         started_at, ended_at, size, mtime, text_stored, est_chars)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET harness_version = excluded.harness_version, parser = excluded.parser,
         parser_match = excluded.parser_match, ended_at = excluded.ended_at, size = excluded.size,
         mtime = excluded.mtime, source_state = 'live', text_stored = excluded.text_stored, est_chars = excluded.est_chars`,
    ).run(
      id, result.harness, result.version ?? null, result.parser, result.match,
      result.cwd === undefined ? null : basename(result.cwd), result.cwd ?? null, path,
      first, last, st.size, st.mtimeMs, withText ? 1 : 0, est,
    );
    // A rewind can drop turns that were stored earlier.
    db.prepare('DELETE FROM turns WHERE session_id = ?').run(id);
    if (!withText) return;
    const put = db.prepare('INSERT INTO turns (session_id, seq, ts, role, text, files_written) VALUES (?, ?, ?, ?, ?, ?)');
    for (const t of result.turns) put.run(id, t.seq, t.ts ?? null, t.role, t.text, JSON.stringify(t.filesWritten));
  });
  return { path, status: 'ingested', result };
}

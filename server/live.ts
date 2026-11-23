/**
 * Hook events → ingest now → extract in batches (context/decisions.md D18): when a full segment of new
 * conversation has built up, when the session ends, after a long idle, or when the person asks.
 */

import { basename } from 'node:path';
import { discover, ingestFile } from './ingest/index.ts';
import { transcriptRoots } from './lib/config.ts';
import { extractAll, sessionsToExtract } from './extract/run.ts';
import { BUDGET_CHARS, pendingSize } from './extract/segment.ts';
import { linkPlans } from './returnpath.ts';
import type { Db } from './store/db.ts';
import { consented } from './store/upkeep.ts';

const IDLE_MS = Number(process.env['SCINTLE_IDLE_EXTRACT_MS'] ?? 30 * 60_000);

export type Progress = { done: number; total: number; startedAt: string };
export type ReadError = { message: string; at: string; capped: boolean };

/** What a failed call says, in words a person can act on. */
function friendly(error: string): string {
  if (/ENOENT|not found/i.test(error)) return "Claude Code's `claude` command isn't on your PATH, so Scintle can't read sessions.";
  if (/log ?in|auth|credential|401/i.test(error)) return 'Claude Code is not logged in. Run `claude` once and sign in, then try again.';
  if (/timed? ?out|ETIMEDOUT|SIGTERM/i.test(error)) return 'A read took too long and was stopped. It will be retried.';
  return `A read failed: ${error.slice(0, 160)}`;
}

export class Live {
  private timers = new Map<string, NodeJS.Timeout>();
  private queue: string[] = [];
  private running = false;
  extracting: string | undefined;
  progress: Progress | null = null;
  lastError: ReadError | null = null;
  private readonly db: Db;
  private readonly changed: () => void;

  constructor(db: Db, changed: () => void) {
    this.db = db;
    this.changed = changed;
  }

  onHook(event: string, transcriptPath: string): void {
    if (transcriptPath === '' || transcriptPath.includes('scintle-run')) return;
    // Sessions are keyed by transcript file name, as ingest keys them.
    const sessionId = basename(transcriptPath, '.jsonl');
    try {
      const o = ingestFile(this.db, transcriptPath, { withText: consented(this.db) });
      const linked = o.status === 'empty' ? 0 : linkPlans(this.db, sessionId);
      if (o.status === 'ingested' || linked > 0) this.changed();
    } catch {
      return;
    }
    if ((event !== 'Stop' && event !== 'SessionEnd') || !consented(this.db)) return;
    clearTimeout(this.timers.get(sessionId));
    this.timers.delete(sessionId);
    if (event === 'SessionEnd' || pendingSize(this.db, sessionId) >= BUDGET_CHARS) {
      this.enqueue(sessionId);
      return;
    }
    this.timers.set(sessionId, setTimeout(() => this.enqueue(sessionId), IDLE_MS));
  }

  /** Index every transcript without reading it with a model; unchanged files are skipped. */
  rescan(): void {
    for (const path of discover(transcriptRoots())) {
      try {
        if (ingestFile(this.db, path, { withText: consented(this.db) }).status !== 'empty') linkPlans(this.db, basename(path, '.jsonl'));
      } catch {
        // A file that vanished or is mid-write is picked up next time.
      }
    }
    this.changed();
  }

  /** Re-scan, then read everything waiting. Returns sessions queued; nothing runs before consent. */
  catchUp(): number {
    this.rescan();
    if (!consented(this.db)) return 0;
    const ids = sessionsToExtract(this.db).filter((id) => pendingSize(this.db, id) > 0);
    for (const id of ids) {
      clearTimeout(this.timers.get(id));
      this.enqueue(id);
    }
    return ids.length;
  }

  private enqueue(sessionId: string): void {
    this.timers.delete(sessionId);
    if (!this.queue.includes(sessionId) && this.extracting !== sessionId) this.queue.push(sessionId);
    void this.drain();
  }

  /** Everything queued is read together, in time order across sessions, with progress for the board. */
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const ids = this.queue.splice(0);
      this.extracting = ids[0];
      this.progress = { done: 0, total: 0, startedAt: new Date().toISOString() };
      this.changed();
      try {
        const r = await extractAll(this.db, ids, {
          onSegment: (seg, done, total) => {
            this.extracting = seg.sessionId;
            this.progress = { ...(this.progress as Progress), done, total };
            if (seg.error !== undefined) this.lastError = { message: friendly(seg.error), at: new Date().toISOString(), capped: false };
            this.changed();
          },
        });
        if (r.stopped !== undefined) this.lastError = { message: `Reached today's limit of model calls; reading resumes tomorrow, or raise SCINTLE_DAILY_CALLS.`, at: new Date().toISOString(), capped: true };
        else if (r.segments.every((x) => x.error === undefined)) this.lastError = null;
      } catch (e) {
        this.lastError = { message: friendly((e as Error).message), at: new Date().toISOString(), capped: false };
      }
      this.extracting = undefined;
      this.progress = null;
      this.changed();
    }
    this.running = false;
  }
}

/** Sessions with unread conversation, its size, and the chunks (model calls) reading it would take. */
export function waiting(db: Db): { sessions: number; chars: number; chunks: number } {
  let sessions = 0, chars = 0, chunks = 0;
  const add = (n: number): void => { if (n > 0) { sessions++; chars += n; chunks += Math.max(1, Math.ceil(n / BUDGET_CHARS)); } };
  for (const id of sessionsToExtract(db)) add(pendingSize(db, id));
  // Before consent only sizes are known.
  for (const r of db.prepare('SELECT est_chars FROM sessions WHERE text_stored = 0').all() as { est_chars: number }[]) add(r.est_chars);
  return { sessions, chars, chunks };
}

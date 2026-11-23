/** The Research helper: one background `claude -p` with web tools; the report becomes a `researched` event. */

import { join } from 'node:path';
import { writeAtomic } from '../lib/files.ts';
import { callModel } from '../lib/model.ts';
import { redactFully } from '../lib/text.ts';
import { buildBrief } from '../brief.ts';
import type { Db } from '../store/db.ts';
import { addEvent } from '../store/ledger.ts';
import { recordCall } from '../store/upkeep.ts';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'report'],
  properties: { summary: { type: 'string' }, report: { type: 'string' } },
} as const;

const ASK = `Research the market for the idea in this brief. Cover: who already solves this problem (name real
products, with links), evidence of demand, what users complain about in existing options, and the riskiest
assumption. Label each claim observed (with a source) or inferred. Return "report" as markdown and
"summary" as one sentence.`;

export function startResearch(db: Db, dir: string, ideaId: string, changed: () => void): number | undefined {
  const brief = buildBrief(db, ideaId);
  if (brief === undefined) return undefined;
  const started = new Date().toISOString();
  const job = Number(db.prepare("INSERT INTO jobs (kind, idea_id, status, started_at) VALUES ('research', ?, 'running', ?)")
    .run(ideaId, started).lastInsertRowid);
  changed();

  void callModel<{ summary: string; report: string }>(redactFully(`${ASK}\n\n${brief.body}`), SCHEMA, {
    tools: 'WebSearch WebFetch', timeoutMs: 20 * 60_000,
  }).then((reply) => {
    recordCall(db, 'research', reply);
    const finished = new Date().toISOString();
    if ('error' in reply) {
      db.prepare("UPDATE jobs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?").run(finished, reply.error, job);
    } else {
      const path = join(dir, 'research', `${ideaId}-${started.replace(/[:.]/g, '-')}.md`);
      writeAtomic(path, reply.output.report);
      db.prepare("UPDATE jobs SET status = 'done', finished_at = ?, output_path = ? WHERE id = ?").run(finished, path, job);
      addEvent(db, { ideaId, type: 'researched', ts: finished, origin: 'user', payload: { report: path, summary: reply.output.summary } });
    }
    changed();
  });
  return job;
}

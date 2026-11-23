/** Plain-text lineage report: the M2 grading view, before any UI exists. */

import type { Db } from './store/db.ts';
import { allIdeas, linksOf, liveEvents } from './store/ledger.ts';

export function lineageReport(db: Db): string {
  const out: string[] = [];
  const ideas = allIdeas(db).sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const i of ideas) {
    const names = liveEvents(db, i.id)
      .filter((e) => e.type === 'renamed')
      .map((e) => String((JSON.parse(e.payload) as { from?: string }).from ?? ''));
    out.push(`## ${i.id} ${[...names, i.title].join(' → ')}  [${i.stage}]`);
    out.push(`Problem: ${i.problem || '(unstated)'}`);
    for (const l of linksOf(db, i.id)) out.push(`Link: ${l.from_idea} --${l.type}--> ${l.to_idea}`);
    for (const e of liveEvents(db, i.id)) {
      const conf = e.confidence === null ? '' : ` (${Math.round(e.confidence * 100)}%)`;
      const payload = e.payload === '{}' ? '' : ` ${e.payload}`;
      out.push(`- ${e.ts.slice(0, 16).replace('T', ' ')} ${e.type}${conf}${payload}`);
      if (e.quote !== null) out.push(`    "${e.quote}"  [${e.session_id?.slice(0, 8)}#${e.turn_seq}]`);
    }
    out.push('');
  }
  const qs = db.prepare("SELECT id, idea_id, kind, payload FROM questions WHERE state = 'open'").all() as {
    id: number; idea_id: string | null; kind: string; payload: string;
  }[];
  if (qs.length > 0) {
    out.push('## Open questions');
    for (const q of qs) out.push(`- Q${q.id} ${q.kind} ${q.idea_id ?? ''} ${q.payload}`);
  }
  return out.join('\n');
}

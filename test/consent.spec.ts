import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestFile } from '../server/ingest/index.ts';
import { waiting } from '../server/live.ts';
import { openDb } from '../server/store/db.ts';
import { consented, setConsent, skipHistory } from '../server/store/upkeep.ts';

const transcript = (lines: number): string => {
  const dir = mkdtempSync(join(tmpdir(), 'scintle-consent-'));
  const path = join(dir, '.claude', 'projects', 'p', 's1.jsonl');
  const recs = Array.from({ length: lines }, (_, i) => JSON.stringify({
    uuid: `u${i}`, parentUuid: i ? `u${i - 1}` : null, sessionId: 's1', type: i % 2 ? 'assistant' : 'user',
    timestamp: '2026-11-20T10:00:00Z', message: { content: i % 2 ? [{ type: 'text', text: 'reply' }] : `prompt ${i}` },
  }));
  mkdirSync(join(dir, '.claude', 'projects', 'p'), { recursive: true });
  writeFileSync(path, `${recs.join('\n')}\n`);
  return path;
};

describe('consent', () => {
  it('stores no turn text before consent, but still knows what a read would cost', () => {
    const db = openDb(':memory:');
    const path = transcript(4);
    expect(consented(db)).toBe(false);
    ingestFile(db, path, { withText: false });
    expect(db.prepare('SELECT COUNT(*) AS n FROM turns').get()).toEqual({ n: 0 });
    expect(waiting(db)).toMatchObject({ sessions: 1, chunks: 1 });
  });

  it('fills in text after consent even though the file is unchanged', () => {
    const db = openDb(':memory:');
    const path = transcript(4);
    ingestFile(db, path, { withText: false });
    setConsent(db, true);
    expect(ingestFile(db, path, { withText: true }).status).toBe('ingested');
    expect(db.prepare('SELECT COUNT(*) AS n FROM turns').get()).toEqual({ n: 4 });
  });

  it('"only new sessions" marks what exists as read, and later turns are still read', () => {
    const db = openDb(':memory:');
    const path = transcript(4);
    setConsent(db, true);
    ingestFile(db, path, { withText: true });
    skipHistory(db);
    expect(waiting(db).sessions).toBe(0);
    writeFileSync(path, `${readFileSync(path, 'utf8')}${JSON.stringify({ uuid: 'u4', parentUuid: 'u3', sessionId: 's1', type: 'user', timestamp: '2026-11-21T10:00:00Z', message: { content: 'a new idea' } })}\n`);
    ingestFile(db, path, { withText: true });
    expect(waiting(db).sessions).toBe(1);
  });
});

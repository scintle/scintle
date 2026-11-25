import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { digest, ingestDocs } from '../server/ingest/docs.ts';
import { pendingTurns, segments } from '../server/extract/segment.ts';
import { openDb } from '../server/store/db.ts';

describe('document digest', () => {
  it('keeps the title, headings and each section opening, and drops code', () => {
    const d = digest('# Trail alerts\nHikers drive hours to closed trails.\n\n```js\nsecret()\n```\n## Decision\nStart with one park.\n');
    expect(d).toContain('# Trail alerts');
    expect(d).toContain('Hikers drive hours');
    expect(d).toContain('## Decision');
    expect(d).not.toContain('secret()');
  });
});

describe('document ingest', () => {
  const doc = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'scintle-docs-'));
    mkdirSync(join(dir, 'plans'));
    const p = join(dir, 'plans', 'trail.md');
    writeFileSync(p, '# Trail alerts plan\nOnly one park first.\n');
    return p;
  };

  it('becomes a one-turn session that extraction will read', () => {
    const db = openDb(':memory:');
    const p = doc();
    expect(ingestDocs(db, [p], true)).toBe(1);
    const id = (db.prepare("SELECT id FROM sessions WHERE harness = 'doc'").get() as { id: string }).id;
    const segs = segments(pendingTurns(db, id));
    expect(segs).toHaveLength(1);
    expect(segs[0]?.[0]).toMatchObject({ role: 'doc', files: [p] });
    expect(ingestDocs(db, [p], true)).toBe(0);
  });

  it('skips a document that a transcript still on disk wrote', () => {
    const db = openDb(':memory:');
    const p = doc();
    db.prepare("INSERT INTO sessions (id, harness, parser, parser_match, transcript_path) VALUES ('s', 'claude-code', 'p', 'exact', '/x')").run();
    db.prepare("INSERT INTO turns (session_id, seq, role, text, files_written) VALUES ('s', 0, 'assistant', '', ?)").run(JSON.stringify([p]));
    expect(ingestDocs(db, [p], true)).toBe(0);
  });

  it('stores no text before consent', () => {
    const db = openDb(':memory:');
    ingestDocs(db, [doc()], false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM turns').get()).toEqual({ n: 0 });
  });
});

describe('only what the person added is read (D25)', () => {
  it('reads nothing outside Claude folder until a folder is added, and forgets it on remove', async () => {
    const { addFolder, discoverDocs, removeFolder } = await import('../server/ingest/docs.ts');
    const db = openDb(':memory:');
    const base = mkdtempSync(join(process.env['HOME'] ?? tmpdir(), '.scintle-test-'));
    try {
      mkdirSync(join(base, 'specs'));
      writeFileSync(join(base, 'README.md'), '# Trail alerts\n');
      writeFileSync(join(base, 'CHANGELOG.md'), '# Changes\n');
      writeFileSync(join(base, 'specs', 'v1.md'), '# v1\n');
      db.prepare("INSERT INTO sessions (id, harness, parser, parser_match, transcript_path, cwd) VALUES ('s', 'claude-code', 'p', 'exact', '/x', ?)").run(base);
      expect(discoverDocs(db).filter((p) => p.startsWith(base))).toEqual([]);
      expect(addFolder(db, base).ok).toBe(true);
      expect(discoverDocs(db).filter((p) => p.startsWith(base)).sort()).toEqual([join(base, 'README.md'), join(base, 'specs', 'v1.md')]);
      ingestDocs(db, discoverDocs(db).filter((p) => p.startsWith(base)), true);
      expect(removeFolder(db, base)).toBe(2);
      expect(db.prepare("SELECT COUNT(*) AS n FROM turns WHERE role = 'doc'").get()).toEqual({ n: 0 });
      expect(addFolder(db, process.env['HOME'] ?? '/').ok).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { ingest, MIN_GROUP, stats, type Env } from '../telemetry/src/collector.ts';
import worker from '../telemetry/src/worker.ts';
import { buildPing } from '../server/telemetry.ts';

/** D1's prepare/bind/run/all shape over node:sqlite, with the real migration. */
function d1(): { env: Env; db: DatabaseSync } {
  const db = new DatabaseSync(':memory:');
  const dir = join(import.meta.dirname, '../telemetry/migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) db.exec(readFileSync(join(dir, f), 'utf8'));
  const stmt = (sql: string, params: unknown[] = []) => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    run: async () => db.prepare(sql).run(...(params as never[])),
    all: async <T,>() => ({ results: db.prepare(sql).all(...(params as never[])) as T[] }),
  });
  return { env: { DB: { prepare: (sql: string) => stmt(sql) } }, db };
}

const NOW = new Date('2026-11-24T12:00:00Z');
const ping = buildPing({ consent: 'yes', installedAt: '2026-11-20' }, NOW, { version: '0.1', os: 'darwin', arch: 'arm64' }).ping;
const post = (body: unknown, raw?: string) => new Request('https://c.invalid/v1/ping', { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.7' }, body: raw ?? JSON.stringify(body) });

describe('collector', () => {
  it('adds a valid message to that day’s counters and keeps nothing else', async () => {
    const { env, db } = d1();
    expect((await ingest(post(ping), env, NOW)).status).toBe(204);
    expect((await ingest(post({ ...ping, first_this_week: false, new_install: false }), env, NOW)).status).toBe(204);
    const rows = db.prepare('SELECT * FROM counts').all();
    expect(rows).toEqual([{
      day: '2026-11-24', version: '0.1', os: 'darwin', arch: 'arm64', install_month: '2026-11', pings: 2, new_installs: 1, week_firsts: 1, month_firsts: 2,
      used_board: 0, used_lineage: 0, used_replay: 0, used_plan: 0, used_research: 0, used_ask: 0, used_correct: 0, used_triage: 0, used_new_idea: 0, used_companion: 0,
    }]);
    expect(JSON.stringify(rows)).not.toContain('203.0.113.7');
  });

  it('rejects extra keys, unknown values, oversized bodies and future install months', async () => {
    const { env, db } = d1();
    expect((await ingest(post({ ...ping, install_id: 'abc' }), env, NOW)).status).toBe(400);
    expect((await ingest(post({ ...ping, os: 'plan9' }), env, NOW)).status).toBe(400);
    expect((await ingest(post({ ...ping, install_month: '2027-01' }), env, NOW)).status).toBe(400);
    expect((await ingest(post(null, 'x'.repeat(2000)), env, NOW)).status).toBe(413);
    expect((await ingest(post(null, 'not json'), env, NOW)).status).toBe(400);
    expect(db.prepare('SELECT COUNT(*) AS n FROM counts').get()).toEqual({ n: 0 });
  });

  it('shows totals, and hides breakdown groups under the minimum', async () => {
    const { env } = d1();
    const today = new Date();
    for (let i = 0; i < MIN_GROUP; i++) await ingest(post(ping), env, today);
    await ingest(post({ ...ping, os: 'linux' }), env, today);
    const s = (await stats(env)) as { daily: { n: number }[]; byOs: { k: string; n: number }[] };
    expect(s.daily[0]?.n).toBe(MIN_GROUP + 1);
    expect(s.byOs).toEqual([{ k: 'darwin', n: MIN_GROUP }]);
  });

  it('counts, per feature, how many messages said it was used, hiding any under the minimum', async () => {
    const { env } = d1();
    const today = new Date();
    const used = (over: Partial<typeof ping.used>) => ({ ...ping, used: { ...ping.used, ...over } });
    for (let i = 0; i < MIN_GROUP; i++) await ingest(post(used({ board: true, plan: i < 2 })), env, today);
    expect((await ingest(post({ ...ping, used: { ...ping.used, spy: true } }), env, today)).status).toBe(400);
    expect((await ingest(post({ ...ping, used: { ...ping.used, plan: 3 } }), env, today)).status).toBe(400);
    const s = (await stats(env)) as { features: { k: string; n: number }[] };
    expect(s.features).toEqual([{ k: 'board', n: MIN_GROUP }]);
  });

  it('serves the page and stats, and nothing else', async () => {
    const { env } = d1();
    expect((await worker.fetch(new Request('https://c.invalid/'), env)).headers.get('content-type')).toContain('text/html');
    expect((await worker.fetch(new Request('https://c.invalid/v1/stats'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://c.invalid/admin'), env)).status).toBe(404);
  });
});

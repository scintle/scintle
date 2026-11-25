/**
 * Scintle's usage-count collector (D26). Each valid message adds 1 to that day's counters and is thrown away.
 * It never reads the client IP, headers or Cloudflare's location data.
 */

import { FEATURES, validPing, type Ping } from '../../server/telemetry-schema.ts';

type Stmt = { bind(...v: unknown[]): Stmt; run(): Promise<unknown>; all<T>(): Promise<{ results: T[] }> };
export type Env = { DB: { prepare(sql: string): Stmt } };

const MAX_BODY = 1024;
const FIRST_MONTH = '2026-11';
/** Public breakdowns hide any group smaller than this, so one unusual setup can't be singled out. */
export const MIN_GROUP = 10;

export const json = (v: unknown, status = 200): Response =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' } });

/** The counters a message adds to, keyed by the day it arrived. */
export function row(p: Ping, day: string): unknown[] {
  return [
    day, p.version, p.os, p.arch, p.install_month ?? 'none', p.new_install ? 1 : 0, p.first_this_week ? 1 : 0, p.first_this_month ? 1 : 0,
    ...FEATURES.map((f) => (p.used[f] ? 1 : 0)),
  ];
}

const USED = FEATURES.map((f) => `used_${f}`);
const UPSERT = `INSERT INTO counts (day, version, os, arch, install_month, pings, new_installs, week_firsts, month_firsts, ${USED.join(', ')})
  VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7, ?8, ${USED.map((_, i) => `?${i + 9}`).join(', ')})
  ON CONFLICT (day, version, os, arch, install_month) DO UPDATE SET
    pings = pings + 1, new_installs = new_installs + ?6, week_firsts = week_firsts + ?7, month_firsts = month_firsts + ?8,
    ${USED.map((c, i) => `${c} = ${c} + ?${i + 9}`).join(', ')}`;

export async function ingest(req: Request, env: Env, now = new Date()): Promise<Response> {
  const text = await req.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const month = now.toISOString().slice(0, 7);
  if (!validPing(body)) return new Response(null, { status: 400 });
  if (body.install_month !== null && (body.install_month < FIRST_MONTH || body.install_month > month)) return new Response(null, { status: 400 });
  await env.DB.prepare(UPSERT).bind(...row(body, now.toISOString().slice(0, 10))).run();
  return new Response(null, { status: 204 });
}

type Count = { k: string; n: number };

/** Aggregates for the public page. Totals per period are shown; breakdowns hide groups under MIN_GROUP. */
export async function stats(env: Env): Promise<object> {
  const q = async (sql: string): Promise<Count[]> => (await env.DB.prepare(sql).all<Count>()).results;
  const hide = (rows: Count[]): Count[] => rows.filter((r) => r.n >= MIN_GROUP);
  const recent = "day >= date('now', '-90 days')";
  return {
    daily: await q(`SELECT day AS k, SUM(pings) AS n FROM counts WHERE ${recent} GROUP BY day ORDER BY day`),
    // Keyed by the week's Monday, so a week spanning New Year stays one week.
    weekly: await q(`SELECT date(day, 'weekday 0', '-6 days') AS k, SUM(week_firsts) AS n FROM counts WHERE ${recent} GROUP BY k ORDER BY k`),
    monthly: await q("SELECT substr(day, 1, 7) AS k, SUM(month_firsts) AS n FROM counts GROUP BY k ORDER BY k"),
    newInstalls: await q(`SELECT day AS k, SUM(new_installs) AS n FROM counts WHERE ${recent} GROUP BY day ORDER BY day`),
    // Over the last 30 days, counted once per install per month.
    byOs: hide(await q("SELECT os AS k, SUM(month_firsts) AS n FROM counts WHERE day >= date('now', '-30 days') GROUP BY os ORDER BY n DESC")),
    byArch: hide(await q("SELECT arch AS k, SUM(month_firsts) AS n FROM counts WHERE day >= date('now', '-30 days') GROUP BY arch ORDER BY n DESC")),
    byVersion: hide(await q("SELECT version AS k, SUM(month_firsts) AS n FROM counts WHERE day >= date('now', '-30 days') GROUP BY version ORDER BY n DESC")),
    // Cohort retention: installs from each month still active in each later month.
    // Of the last 30 days' messages, how many said each feature was used.
    // One row of sums, not a UNION per feature: D1 caps the terms of a compound SELECT.
    features: hide(await env.DB.prepare(`SELECT ${FEATURES.map((f) => `COALESCE(SUM(used_${f}), 0) AS ${f}`).join(', ')} FROM counts WHERE day >= date('now', '-30 days')`)
      .all<Record<string, number>>()
      .then(({ results }) => FEATURES.map((f) => ({ k: f, n: Number(results[0]?.[f] ?? 0) })).sort((x, y) => y.n - x.n))),
    cohorts: hide(await q("SELECT install_month || ' → ' || substr(day, 1, 7) AS k, SUM(month_firsts) AS n FROM counts WHERE install_month != 'none' GROUP BY install_month, substr(day, 1, 7) ORDER BY k")),
    minGroup: MIN_GROUP,
  };
}

export const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scintle usage</title><style>
:root{--bg:#f4f5fa;--ink:#12141c;--muted:#535a6e;--rule:#dfe1ea}
@media (prefers-color-scheme:dark){:root{--bg:#0c0e14;--ink:#e2e2eb;--muted:#9ba1b4;--rule:#262a36}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;padding:24px 16px;max-width:760px;margin-inline:auto}
h1{font-size:22px;margin:0 0 4px}p{color:var(--muted);margin:0 0 20px}h2{font-size:14px;margin:24px 0 6px}
table{border-collapse:collapse;width:100%}td{border-bottom:1px solid var(--rule);padding:4px 0;font-variant-numeric:tabular-nums}td+td{text-align:right}
</style></head><body><h1>Scintle usage</h1>
<p>Totals from people who said yes to an anonymous daily count. No IDs, no IPs, no session content. Breakdowns hide any group under ${MIN_GROUP}. <a href="https://scintle.github.io/scintle/trust/telemetry/">How this works</a></p>
<div id="out">Loading…</div><script>
const T={daily:'Daily active (last 90 days)',weekly:'Weekly active (week starting)',monthly:'Monthly active',newInstalls:'New installs',byOs:'OS, last 30 days',byArch:'Chip, last 30 days',byVersion:'Version, last 30 days',features:'Features used, messages in the last 30 days',cohorts:'Still active, by install month'};
fetch('v1/stats').then(r=>r.json()).then(s=>{const o=document.getElementById('out');o.textContent='';
for(const[k,label]of Object.entries(T)){const h=document.createElement('h2');h.textContent=label;o.append(h);const t=document.createElement('table');
const rows=s[k]||[];if(!rows.length){const p=document.createElement('p');p.textContent='Not enough data yet.';o.append(p);continue}
for(const r of rows){const tr=t.insertRow();tr.insertCell().textContent=r.k;tr.insertCell().textContent=r.n}o.append(t)}});
</script></body></html>`;

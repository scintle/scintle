/** The opt-in daily usage count (D26): no ID, one message a day at most, sent only by scintled. */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from './lib/config.ts';
import { writeJson } from './lib/files.ts';
import { ARCH, OS, SCHEMA_VERSION, type Ping, FEATURES, type Feature } from './telemetry-schema.ts';

/** Filled in by scripts/build-release.sh; empty in the repo, so a clone or fork never sends. */
const RELEASE_ENDPOINT = '';

type State = {
  /** null: not asked yet (or asked under an older schema). */
  consent: 'yes' | 'no' | null;
  consentSchema?: number;
  installedAt: string;
  /** The first day the board was open with reading allowed; the question waits for a later day. */
  firstBoardDay?: string;
  /** Features used since the last message; kept only while sharing is on, cleared when a message is sent. */
  used?: Feature[];
  pinged?: boolean;
  lastDay?: string;
  lastWeek?: string;
  lastMonth?: string;
  lastPayload?: Ping;
  lastSentAt?: string;
};

type Blocked = 'not-asked' | 'declined' | 'DO_NOT_TRACK' | 'SCINTLE_TELEMETRY_DISABLED' | 'CI' | 'no-endpoint';

const file = (): string => join(dataDir(), 'telemetry.json');
const day = (d: Date): string => d.toISOString().slice(0, 10);
const month = (d: Date): string => d.toISOString().slice(0, 7);

/** ISO 8601 week, e.g. 2026-W48, in UTC. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function loadState(now = new Date()): State {
  try {
    const s = JSON.parse(readFileSync(file(), 'utf8')) as State;
    // A changed schema means asking again (D26).
    if (s.consent !== null && s.consentSchema !== SCHEMA_VERSION) s.consent = null;
    return s;
  } catch {
    return { consent: null, installedAt: day(now) };
  }
}

const save = (s: State): void => writeJson(file(), s);

function endpoint(env: NodeJS.ProcessEnv): string {
  return env['SCINTLE_TELEMETRY_ENDPOINT'] ?? RELEASE_ENDPOINT;
}

const truthy = (v: string | undefined): boolean => v !== undefined && v !== '' && v !== '0' && v.toLowerCase() !== 'false';

/** Why nothing would be sent, or null when a ping is allowed. */
export function blockedBy(s: State, env: NodeJS.ProcessEnv = process.env): Blocked | null {
  if (truthy(env['DO_NOT_TRACK'])) return 'DO_NOT_TRACK';
  if (truthy(env['SCINTLE_TELEMETRY_DISABLED'])) return 'SCINTLE_TELEMETRY_DISABLED';
  if (truthy(env['CI'])) return 'CI';
  if (s.consent === null) return 'not-asked';
  if (s.consent === 'no') return 'declined';
  if (endpoint(env) === '') return 'no-endpoint';
  return null;
}

function scintleVersion(): string {
  try {
    const v = (JSON.parse(readFileSync(join(import.meta.dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')) as { version?: string }).version ?? '0.0';
    return v.split('.').slice(0, 2).join('.');
  } catch {
    return '0.0';
  }
}

const pick = <T extends readonly string[]>(list: T, v: string): T[number] => (list.includes(v) ? v : 'other');

/** The message for `now`, and the marks to keep if it is sent. Pure, so it can be tested. */
export function buildPing(s: State, now: Date, host = { version: scintleVersion(), os: process.platform as string, arch: process.arch as string }): { ping: Ping; next: State } {
  const installed = new Date(`${s.installedAt}T00:00:00Z`);
  const sixMonths = new Date(installed);
  sixMonths.setUTCMonth(sixMonths.getUTCMonth() + 6);
  const ping: Ping = {
    schema: SCHEMA_VERSION,
    event: 'daily_active',
    version: host.version,
    os: pick(OS, host.os),
    arch: pick(ARCH, host.arch),
    new_install: s.pinged !== true,
    first_this_week: s.lastWeek !== isoWeek(now),
    first_this_month: s.lastMonth !== month(now),
    install_month: now < sixMonths ? month(installed) : null,
    used: Object.fromEntries(FEATURES.map((f) => [f, s.used?.includes(f) ?? false])) as Record<Feature, boolean>,
  };
  return { ping, next: { ...s, used: [], pinged: true, lastDay: day(now), lastWeek: isoWeek(now), lastMonth: month(now), lastPayload: ping, lastSentAt: now.toISOString() } };
}

/** At most once per UTC day. The marks are saved before sending, so a failure is never retried. */
export async function maybePing(now = new Date(), env: NodeJS.ProcessEnv = process.env, log: (m: string) => void = console.log): Promise<Ping | null> {
  const s = loadState(now);
  if (!existsSync(file())) save(s);
  if (s.lastDay === day(now)) return null;
  const debug = truthy(env['SCINTLE_TELEMETRY_DEBUG']);
  const blocked = blockedBy(s, env);
  if (blocked !== null && !(debug && blocked === 'no-endpoint')) return null;
  const { ping, next } = buildPing(s, now);
  if (debug) {
    log(`telemetry (debug, not sent): ${JSON.stringify(ping)}`);
    return ping;
  }
  save(next);
  try {
    await fetch(endpoint(env), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'scintle' },
      body: JSON.stringify(ping),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Nothing is retried; a missed day is a missed day.
  }
  return ping;
}

export function setConsent(on: boolean, now = new Date()): State {
  const s = loadState(now);
  // Saying no deletes the marks, so a later yes starts again as a new install.
  const next: State = on ? { ...s, consent: 'yes', consentSchema: SCHEMA_VERSION } : { consent: 'no', consentSchema: SCHEMA_VERSION, installedAt: s.installedAt };
  save(next);
  return next;
}

/** What the board and `scintle telemetry status` show. */
export function status(env: NodeJS.ProcessEnv = process.env, now = new Date()): { consent: State['consent']; blockedBy: Blocked | null; askNow: boolean; next: Ping; lastPayload: Ping | null; lastSentAt: string | null } {
  const s = loadState(now);
  const blocked = blockedBy(s, env);
  // Asked once Scintle has been useful: the board opened again on a later day than the first.
  const askNow = blocked === 'not-asked' && s.firstBoardDay !== undefined && s.firstBoardDay < day(now);
  return { consent: s.consent, blockedBy: blocked, askNow, next: buildPing(s, now).ping, lastPayload: s.lastPayload ?? null, lastSentAt: s.lastSentAt ?? null };
}

/** Notes that a feature was used, only while sharing is on: the next message says yes for it. */
export function markUsed(feature: Feature, now = new Date()): void {
  const s = loadState(now);
  if (s.consent !== 'yes' || s.used?.includes(feature)) return;
  save({ ...s, used: [...(s.used ?? []), feature] });
}

/** Notes the first day the board was opened with reading allowed. */
export function noteBoardOpen(now = new Date()): void {
  const s = loadState(now);
  if (s.firstBoardDay === undefined) save({ ...s, firstBoardDay: day(now) });
}

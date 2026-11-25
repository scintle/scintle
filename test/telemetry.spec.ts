import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blockedBy, buildPing, isoWeek, loadState, markUsed, maybePing, noteBoardOpen, setConsent, status } from '../server/telemetry.ts';
import { PING_KEYS, validPing } from '../server/telemetry-schema.ts';

const host = { version: '0.1', os: 'darwin', arch: 'arm64' };
const at = (iso: string): Date => new Date(iso);
const ENV = { SCINTLE_TELEMETRY_ENDPOINT: 'https://collector.invalid/v1/ping' };

let home: string;
let sent: unknown[];
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'scintle-tel-'));
  process.env['SCINTLE_HOME'] = home;
  sent = [];
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => { sent.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['SCINTLE_HOME'];
  rmSync(home, { recursive: true, force: true });
});

describe('the message', () => {
  it('has exactly the published keys and passes the collector’s own check', () => {
    const { ping } = buildPing({ consent: 'yes', installedAt: '2026-11-24' }, at('2026-11-24T12:00:00Z'), host);
    expect(Object.keys(ping).sort()).toEqual([...PING_KEYS].sort());
    expect(validPing(ping)).toBe(true);
    expect(validPing({ ...ping, install_id: 'x' })).toBe(false);
    expect(validPing({ ...ping, os: 'plan9' })).toBe(false);
  });

  it('folds unknown platforms into "other" and drops the install month after six months', () => {
    const s = { consent: 'yes' as const, installedAt: '2026-01-10' };
    expect(buildPing(s, at('2026-07-09T00:00:00Z'), { ...host, os: 'freebsd', arch: 'ia32' }).ping).toMatchObject({ os: 'other', arch: 'other', install_month: '2026-01' });
    expect(buildPing(s, at('2026-07-10T00:00:00Z'), host).ping.install_month).toBeNull();
  });
});

describe('weekly and monthly marks', () => {
  it('marks the first message of each ISO week and month, and the very first one as new', () => {
    let s = { consent: 'yes' as const, installedAt: '2026-11-28' };
    const send = (iso: string) => { const r = buildPing(s, at(iso), host); s = r.next as typeof s; return r.ping; };
    expect(send('2026-11-28T09:00:00Z')).toMatchObject({ new_install: true, first_this_week: true, first_this_month: true }); // Saturday
    expect(send('2026-11-29T09:00:00Z')).toMatchObject({ new_install: false, first_this_week: false, first_this_month: false }); // Sunday, same week
    expect(send('2026-11-30T09:00:00Z')).toMatchObject({ first_this_week: true, first_this_month: false }); // Monday: new week
    expect(send('2026-12-01T09:00:00Z')).toMatchObject({ first_this_week: false, first_this_month: true }); // new month, same week
  });

  it('numbers ISO weeks across a year boundary', () => {
    expect(isoWeek(at('2026-12-31T12:00:00Z'))).toBe('2026-W53');
    expect(isoWeek(at('2027-01-04T12:00:00Z'))).toBe('2027-W01');
  });
});

describe('when it sends', () => {
  it('sends nothing before a yes, and nothing under DO_NOT_TRACK or CI', async () => {
    expect(await maybePing(at('2026-11-24T10:00:00Z'), ENV)).toBeNull();
    setConsent(true);
    expect(blockedBy(loadState(), { ...ENV, DO_NOT_TRACK: '1' })).toBe('DO_NOT_TRACK');
    expect(await maybePing(at('2026-11-24T10:00:00Z'), { ...ENV, DO_NOT_TRACK: '1' })).toBeNull();
    expect(await maybePing(at('2026-11-24T10:00:00Z'), { ...ENV, CI: 'true' })).toBeNull();
    expect(sent).toEqual([]);
  });

  it('sends at most once a UTC day', async () => {
    setConsent(true);
    await maybePing(at('2026-11-24T01:00:00Z'), ENV);
    await maybePing(at('2026-11-24T23:00:00Z'), ENV);
    await maybePing(at('2026-11-25T00:30:00Z'), ENV);
    expect(sent).toHaveLength(2);
    expect(sent.every(validPing)).toBe(true);
  });

  it('never sends from a build without a collector address', async () => {
    setConsent(true);
    expect(await maybePing(at('2026-11-24T10:00:00Z'), {})).toBeNull();
    expect(sent).toEqual([]);
  });

  it('prints instead of sending in debug mode', async () => {
    setConsent(true);
    const lines: string[] = [];
    await maybePing(at('2026-11-24T10:00:00Z'), { ...ENV, SCINTLE_TELEMETRY_DEBUG: '1' }, (m) => lines.push(m));
    expect(sent).toEqual([]);
    expect(lines[0]).toContain('"event":"daily_active"');
  });

  it('forgets the marks on no, so a later yes counts as a new install', async () => {
    setConsent(true);
    await maybePing(at('2026-11-24T10:00:00Z'), ENV);
    setConsent(false);
    expect(loadState()).toMatchObject({ consent: 'no' });
    expect(loadState().lastPayload).toBeUndefined();
    setConsent(true);
    await maybePing(at('2026-11-25T10:00:00Z'), ENV);
    expect(sent[1]).toMatchObject({ new_install: true });
  });
});

describe('when it asks', () => {
  it('waits until the board is open on a later day than its first, and stops asking once answered', () => {
    expect(status(ENV, at('2026-11-24T10:00:00Z')).askNow).toBe(false);
    noteBoardOpen(at('2026-11-24T10:00:00Z'));
    noteBoardOpen(at('2026-11-25T10:00:00Z'));
    expect(status(ENV, at('2026-11-24T23:00:00Z')).askNow).toBe(false);
    expect(status(ENV, at('2026-11-25T09:00:00Z')).askNow).toBe(true);
    setConsent(false, at('2026-11-25T09:05:00Z'));
    expect(status(ENV, at('2026-11-26T09:00:00Z')).askNow).toBe(false);
  });
});

describe('what it says was used', () => {
  it('keeps nothing without a yes, says yes once per feature, and starts over after each message', async () => {
    markUsed('plan');
    expect(loadState().used ?? []).toEqual([]);
    setConsent(true);
    markUsed('plan');
    markUsed('plan');
    markUsed('replay');
    expect(loadState().used).toEqual(['plan', 'replay']);
    await maybePing(at('2026-11-24T10:00:00Z'), ENV);
    const got = sent as { used: Record<string, boolean> }[];
    expect(got[0]?.used).toMatchObject({ plan: true, replay: true, board: false, research: false });
    expect(loadState().used).toEqual([]);
    await maybePing(at('2026-11-25T10:00:00Z'), ENV);
    expect(Object.values(got[1]?.used ?? {}).every((v) => v === false)).toBe(true);
  });
});

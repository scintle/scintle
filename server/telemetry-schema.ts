/**
 * The whole telemetry message (D26). The client builds it and the collector validates it from this one
 * file, so the two can't drift. No Node imports: the Cloudflare Worker imports it too.
 */

export const SCHEMA_VERSION = 2;

export const OS = ['darwin', 'linux', 'win32', 'other'] as const;
export const ARCH = ['arm64', 'x64', 'other'] as const;
/** What a person did since the last message, as yes or no: never how often, when, or on which idea. */
export const FEATURES = ['board', 'lineage', 'replay', 'plan', 'research', 'ask', 'correct', 'triage', 'new_idea', 'companion'] as const;
export type Feature = (typeof FEATURES)[number];

export type Ping = {
  schema: typeof SCHEMA_VERSION;
  event: 'daily_active';
  /** major.minor of Scintle. */
  version: string;
  os: (typeof OS)[number];
  arch: (typeof ARCH)[number];
  /** The first ping this install ever sent. */
  new_install: boolean;
  /** The first ping in this ISO week (UTC). */
  first_this_week: boolean;
  /** The first ping in this calendar month (UTC). */
  first_this_month: boolean;
  /** YYYY-MM of install; null after six months, so long-time users blend in. */
  install_month: string | null;
  /** Each feature: used since the last message. */
  used: Record<Feature, boolean>;
};

export const PING_KEYS = ['schema', 'event', 'version', 'os', 'arch', 'new_install', 'first_this_week', 'first_this_month', 'install_month', 'used'] as const;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const VERSION = /^\d{1,3}\.\d{1,3}$/;

/** The collector's gate: exactly these keys, each from its published set of values. */
export function validPing(x: unknown): x is Ping {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== PING_KEYS.length || !PING_KEYS.every((k) => k in o)) return false;
  return o['schema'] === SCHEMA_VERSION
    && o['event'] === 'daily_active'
    && typeof o['version'] === 'string' && VERSION.test(o['version'])
    && (OS as readonly unknown[]).includes(o['os'])
    && (ARCH as readonly unknown[]).includes(o['arch'])
    && typeof o['new_install'] === 'boolean'
    && typeof o['first_this_week'] === 'boolean'
    && typeof o['first_this_month'] === 'boolean'
    && (o['install_month'] === null || (typeof o['install_month'] === 'string' && MONTH.test(o['install_month'])))
    && validUsed(o['used']);
}

function validUsed(x: unknown): boolean {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return Object.keys(o).length === FEATURES.length && FEATURES.every((f) => typeof o[f] === 'boolean');
}

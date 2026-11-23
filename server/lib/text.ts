import { redact } from './redact.ts';

/** Redact until stable: a cut can leave `KEY= …`, which the next pass would consume. */
export function redactFully(s: string, limit = 4): string {
  let cur = s;
  for (let i = 0; i < limit; i++) {
    const next = redact(cur).text;
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

/** Redacted and capped; redaction runs first so a cut never leaves half a secret. */
export function clean(s: string, max = 20_000): string {
  const red = redactFully(s.trim());
  return red.length <= max ? red : redactFully(`${red.slice(0, max)} …`);
}

/** Rejects absent, unparsable, pre-2023 and future timestamps. */
export function isPlausibleTimestamp(v: unknown): v is string {
  if (typeof v !== 'string' || v === '') return false;
  const t = Date.parse(v);
  return !Number.isNaN(t) && t >= Date.UTC(2023, 0, 1) && t <= Date.now() + 86_400_000;
}

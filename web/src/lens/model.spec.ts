import { describe, expect, it } from 'vitest';
import type { Idea } from '../lib/types';
import { buildModel } from './model';

const idea = (id: string, ts: string): Idea => ({ id, title: id, problem: '', stage: 'exploring', created_at: ts, updated_at: ts, closed_at: null });

describe('lens model time columns', () => {
  it('keeps days after a daylight-saving change on their own columns', () => {
    process.env.TZ = 'America/Los_Angeles';
    const ideas = [idea('A', '2026-10-12T19:00:00Z'), idea('B', '2026-11-18T19:00:00Z'), idea('C', '2026-11-21T19:00:00Z')];
    const m = buildModel(ideas, new Map(), [], '2026-11-22T20:00:00Z');
    const colOf = (id: string): string => m.ideas.find((d) => d.id === id)?.start[0] ?? '';
    expect(new Set([colOf('A'), colOf('B'), colOf('C')]).size).toBe(3);
    expect(colOf('C')).not.toBe(m.now[0]);
    expect(m.cols.at(-1)?.k).toBe(m.now[0]);
  });
});

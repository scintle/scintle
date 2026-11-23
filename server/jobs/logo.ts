/**
 * Drawn logos for ideas whose project has none (D20): one `claude -p` call per idea, saved as SVG in the data
 * dir. The model's SVG is reduced to plain shapes and colours before it is stored (no scripts, links or text).
 */

import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from '../lib/files.ts';
import { callModel } from '../lib/model.ts';
import { redactFully } from '../lib/text.ts';
import type { Db } from '../store/db.ts';
import { callsToday, consented, DAILY_CALL_CAP, recordCall } from '../store/upkeep.ts';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['svg', 'idea'],
  properties: { svg: { type: 'string' }, idea: { type: 'string' } },
} as const;

/** Background colours, one per idea, so a board of drawn logos is not a wall of one hue. */
const PALETTE = [
  ['teal', '#0f766e'], ['emerald', '#047857'], ['amber', '#b45309'], ['coral', '#c2410c'], ['crimson', '#be123c'],
  ['ocean blue', '#1d4ed8'], ['magenta', '#a21caf'], ['forest', '#3f6212'], ['slate', '#334155'], ['gold', '#a16207'],
] as const;

/** Stable per idea: the same idea keeps its colour when redrawn. */
export function logoColour(ideaId: string): readonly [string, string] {
  let h = 0;
  for (const c of ideaId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length] as readonly [string, string];
}

const brief = (title: string, problem: string, [name, hex]: readonly [string, string]): string => `Design a logo mark for a software project.
Project: ${title}
Problem it solves: ${problem || '(not stated)'}

The svg: viewBox="0 0 64 64"; a filled circle background (cx 32, cy 32, r 32) in ${name} (${hex}), exactly this
colour, not purple or indigo; on it ONE bold symbolic glyph, centred and kept inside a radius of 20 so the circle frames
it, that captures the project, in off-white plus at most one light accent that harmonises with ${name}. No text or letters, no thin lines,
no small details: it must read at 20px. Flat vector; at most one gradient; no external references. "idea" is one
sentence on the concept.`;

const ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath']);
const ATTRS = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'points',
  'fill', 'fill-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity',
  'opacity', 'transform', 'id', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'clip-path', 'clip-rule',
]);

/** Keep only allowed elements and attributes; anything else drops the whole logo. References stay in-document. */
export function cleanSvg(svg: string): string | undefined {
  const s = svg.trim();
  if (!s.startsWith('<svg') || !s.endsWith('</svg>') || s.length > 20_000) return undefined;
  const tags = s.match(/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g) ?? [];
  for (const tag of tags) {
    const m = /^<\/?([a-zA-Z][\w:-]*)([^>]*)>$/.exec(tag);
    if (!m || !ELEMENTS.has(m[1] as string)) return undefined;
    for (const [, name, value] of (m[2] as string).matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
      if (!ATTRS.has(name as string)) return undefined;
      if (/url\(\s*(?!#)/i.test(value as string) || /javascript:|data:/i.test(value as string)) return undefined;
    }
  }
  if (/<!|<\?|&/.test(s.replace(/<\/?[a-zA-Z][^>]*>/g, ''))) return undefined;
  return s.includes('xmlns=') ? s : s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
}

export const drawnLogoPath = (dir: string, ideaId: string): string => join(dir, 'logos', `${ideaId}.svg`);

export async function drawLogo(db: Db, dir: string, ideaId: string): Promise<boolean> {
  if (!consented(db) || callsToday(db) >= DAILY_CALL_CAP) return false;
  const idea = db.prepare('SELECT title, problem FROM ideas WHERE id = ?').get(ideaId) as { title: string; problem: string } | undefined;
  if (idea === undefined) return false;
  const reply = await callModel<{ svg: string; idea: string }>(redactFully(brief(idea.title, idea.problem, logoColour(ideaId))), SCHEMA, { timeoutMs: 120_000 });
  recordCall(db, 'logo', reply);
  if ('error' in reply) return false;
  const svg = cleanSvg(reply.output.svg);
  if (svg === undefined) return false;
  writeAtomic(drawnLogoPath(dir, ideaId), `${svg}\n`);
  return true;
}

export function forgetLogo(dir: string, ideaId: string): void {
  rmSync(drawnLogoPath(dir, ideaId), { force: true });
}

export function hasDrawnLogo(dir: string, ideaId: string): boolean {
  return existsSync(drawnLogoPath(dir, ideaId));
}

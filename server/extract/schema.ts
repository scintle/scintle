/** The extraction reply: JSON Schema for `--json-schema`, and our own check of the same shape. */

import { EVENT_TYPES, type EventType } from '../store/ledger.ts';

const INFERRED_TYPES = EVENT_TYPES.filter((t) => t !== 'born');

type ProposedEvent = {
  idea: string;
  type: EventType;
  payload: Record<string, unknown>;
  confidence: number;
  seq: number;
  quote: string;
};
type NewIdeaRef = { ref: string; title: string; problem: string; seq: number; quote: string; confidence: number };
type ProposedQuestion = { idea: string; kind: 'merge' | 'pivot-or-narrow' | 'alive'; text: string };
export type Extraction = { new_ideas: NewIdeaRef[]; events: ProposedEvent[]; question: ProposedQuestion | null };

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const int = { type: 'integer' } as const;

export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['new_ideas', 'events', 'question'],
  properties: {
    new_ideas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'title', 'problem', 'seq', 'quote', 'confidence'],
        properties: { ref: str, title: str, problem: str, seq: int, quote: str, confidence: num },
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['idea', 'type', 'payload', 'confidence', 'seq', 'quote'],
        properties: {
          idea: str,
          type: { type: 'string', enum: INFERRED_TYPES },
          payload: { type: 'object' },
          confidence: num,
          seq: int,
          quote: str,
        },
      },
    },
    question: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['idea', 'kind', 'text'],
          properties: { idea: str, kind: { type: 'string', enum: ['merge', 'pivot-or-narrow', 'alive'] }, text: str },
        },
      ],
    },
  },
} as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Keeps the well-formed parts of a reply; anything malformed is dropped, never repaired. */
export function sanitize(raw: unknown): Extraction {
  const out: Extraction = { new_ideas: [], events: [], question: null };
  if (!isObj(raw)) return out;
  for (const n of Array.isArray(raw['new_ideas']) ? raw['new_ideas'] : []) {
    if (isObj(n) && typeof n['ref'] === 'string' && typeof n['title'] === 'string' && typeof n['problem'] === 'string'
      && Number.isInteger(n['seq']) && typeof n['quote'] === 'string' && typeof n['confidence'] === 'number') {
      out.new_ideas.push(n as NewIdeaRef);
    }
  }
  for (const e of Array.isArray(raw['events']) ? raw['events'] : []) {
    if (isObj(e) && typeof e['idea'] === 'string' && (INFERRED_TYPES as readonly unknown[]).includes(e['type'])
      && isObj(e['payload']) && typeof e['confidence'] === 'number' && Number.isInteger(e['seq']) && typeof e['quote'] === 'string') {
      out.events.push(e as ProposedEvent);
    }
  }
  const q = raw['question'];
  if (isObj(q) && typeof q['idea'] === 'string' && typeof q['text'] === 'string'
    && ['merge', 'pivot-or-narrow', 'alive'].includes(q['kind'] as string)) {
    out.question = q as ProposedQuestion;
  }
  return out;
}

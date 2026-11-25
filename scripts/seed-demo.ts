/**
 * A made-up history for screenshots and the demo video: no real ideas, sessions or people.
 * Usage: SCINTLE_HOME=/tmp/demo node --experimental-strip-types scripts/seed-demo.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dataDir } from '../server/lib/config.ts';
import { setConsent } from '../server/store/upkeep.ts';
import { openDb } from '../server/store/db.ts';
import { addEvent, addLink, createIdea, type EventType, type QuoteBy } from '../server/store/ledger.ts';

const db = openDb(join(dataDir(), 'scintle.db'));
setConsent(db, true);

const day = (d: string, h = 10): string => `${d}T${String(h).padStart(2, '0')}:00:00.000Z`;
const born = (d: string, title: string, problem: string, quote: string, by: QuoteBy = 'you'): string =>
  createIdea(db, title, problem, { ts: day(d), origin: 'inferred', confidence: 0.9, quote, quoteBy: by });
const ev = (id: string, d: string, type: EventType, quote: string, payload: Record<string, unknown> = {}, by: QuoteBy = 'you', origin: 'inferred' | 'user' = 'inferred'): number =>
  addEvent(db, { ideaId: id, type, ts: day(d, 14), origin, confidence: 0.85, payload, quote, quoteBy: by });

// A trail-alerts app that narrowed, shipped, and was released.
const trail = born('2026-07-02', 'Trail alerts', 'Hikers drive out to trails that turn out to be closed', 'I keep driving two hours to trailheads that are closed');
ev(trail, '2026-07-09', 'narrowed', 'just national parks first, they publish closures as a feed', { problem: 'Hikers miss national park trail closures' });
ev(trail, '2026-07-20', 'decided', 'push notifications only, no account needed', {}, 'you', 'user');
ev(trail, '2026-08-03', 'planned', 'plan saved: closure-feed poller and a map', {}, 'claude', 'user');
ev(trail, '2026-08-11', 'building', 'starting on the poller today');
ev(trail, '2026-09-18', 'released', 'it is live on the app store', {}, 'you', 'user');

// A standup bot that pivoted into an async digest.
const standup = born('2026-07-06', 'Standup bot', 'Remote teams sit through status meetings', 'our standups are 30 minutes of people reading tickets aloud');
ev(standup, '2026-07-14', 'tried', 'a Slack bot that asks three questions; nobody answered it after day two');
const digest = born('2026-07-28', 'Async status digest', 'Managers can’t see progress without asking', 'forget the bot, managers just want a weekly digest built from the commits');
const piv = ev(standup, '2026-07-28', 'pivoted', 'forget the bot, managers just want a weekly digest built from the commits', { to: digest });
addLink(db, standup, digest, 'pivot', piv);
ev(digest, '2026-08-20', 'renamed', 'call it Weekly Pulse', { from: 'Async status digest', to: 'Weekly Pulse' });
ev(digest, '2026-09-02', 'planned', 'plan saved: GitHub app plus an email digest', {}, 'claude', 'user');
ev(digest, '2026-10-12', 'building', 'wiring the GitHub app');
ev(digest, '2026-11-20', 'decided', 'send it Friday afternoons, not Monday', {}, 'you', 'user');

// A recipe scaler that was parked, then revived.
const recipe = born('2026-07-15', 'Recipe scaler', 'Cooks rescale recipes by hand and get the ratios wrong', 'I always mess up baking when I double a recipe');
ev(recipe, '2026-07-30', 'researched', 'report: unit conversion is the hard part, not the maths', {}, 'document');
ev(recipe, '2026-08-08', 'parked', 'not now, the trail app comes first', { why: 'trail alerts first' }, 'you', 'user');
ev(recipe, '2026-11-19', 'revived', 'back to the recipe idea, my sister asked for it again', {}, 'you', 'user');

// A plant reminder that was dropped: crowded market.
const plant = born('2026-08-05', 'Plant watering reminders', 'People forget to water plants', 'a reminder app that knows each plant’s schedule');
ev(plant, '2026-08-07', 'researched', 'there are at least nine apps doing exactly this, two of them free', {}, 'claude');
ev(plant, '2026-08-07', 'dropped', 'yeah, not worth it', { reason: 'crowded' }, 'you', 'user');

// A guitar log that spawned a chord trainer; both alive.
const guitar = born('2026-08-12', 'Guitar practice log', 'Learners can’t see whether practice is paying off', 'I want to see my practice minutes per song over months');
ev(guitar, '2026-08-25', 'decided', 'log by song, not by session', {}, 'you', 'user');
const chords = born('2026-09-04', 'Chord progression trainer', 'Learners stall switching between chords', 'a side thing: drills for the chord changes I keep fumbling');
const sp = ev(guitar, '2026-09-04', 'spawned', 'a side thing: drills for the chord changes I keep fumbling', { to: chords });
addLink(db, guitar, chords, 'spawn', sp);
ev(chords, '2026-11-22', 'planned', 'plan saved: metronome plus a change counter', {}, 'claude', 'user');

// Two money ideas that merged.
const split = born('2026-09-10', 'Receipt splitter', 'Friends argue over who paid what', 'photograph the receipt, split it per person');
const budget = born('2026-09-16', 'Group trip budget', 'Trips go over budget and nobody notices', 'a shared trip budget that warns before we overspend');
const trip = born('2026-10-05', 'Trip money', 'Groups lose track of shared trip spending', 'these are the same app: receipts in, budget out');
for (const parent of [split, budget]) {
  const m = ev(parent, '2026-10-05', 'merged', 'these are the same app: receipts in, budget out', { into: trip }, 'you', 'user');
  addLink(db, parent, trip, 'merge', m);
}
ev(trip, '2026-11-21', 'planned', 'plan saved: receipt OCR first, budget later', {}, 'claude', 'user');

// One looked at and never wanted.
const pod = born('2026-09-22', 'Podcast summariser', 'Developers have no time for long podcasts', 'what about summaries of dev podcasts', 'claude');
ev(pod, '2026-09-23', 'dropped', 'not for me', { reason: 'not-interested' }, 'you', 'user');

// Fresh seeds.
born('2026-11-12', 'Pair focus timer', 'Pairs lose focus without shared breaks', 'a timer both people see when pairing');
const ferry = born('2026-11-19', 'Ferry delay map', 'Commuters find out about ferry delays at the pier', 'the ferry app only says delayed after you get there', 'document');
ev(ferry, '2026-11-21', 'researched', 'report: the operator has a public vessel-position feed', {}, 'document');

// Simple monogram logos, so the demo never asks a model to draw them.
const COLOURS = ['#4f9dff', '#f07a45', '#4edea3', '#e0b020', '#f062b8', '#9d8cf5', '#ff5a5f', '#8590a8'];
const logos = join(dataDir(), 'logos');
mkdirSync(logos, { recursive: true });
for (const [i, { id, title }] of (db.prepare('SELECT id, title FROM ideas ORDER BY id').all() as { id: string; title: string }[]).entries()) {
  const c = COLOURS[i % COLOURS.length];
  writeFileSync(join(logos, `${id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${c}" fill-opacity=".18"/><circle cx="32" cy="32" r="18" fill="none" stroke="${c}" stroke-width="4"/><text x="32" y="39" text-anchor="middle" font-family="ui-sans-serif,system-ui" font-size="20" font-weight="700" fill="${c}">${title[0]}</text></svg>\n`);
}

db.close();
console.log(`Seeded ${dataDir()}`);

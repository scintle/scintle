// Scintle's Claude Code companion (D30, D32): points Claude at an idea a prompt names, and once Claude reads that
// idea's history, puts one line under the prompt with the most interesting thing about it and a button to the board.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import type { CardEvent, CaughtBand, CaughtItem, Fact, Here, IdeaCard, PickIdea, Pointer } from '../types/companion'

type Match = { ideas: Pointer[]; context: string }

const MARK = '✦ Scintle'
/** Prompt text → what Scintle found for it, drawn under that prompt for as long as the transcript shows it. */
/** The /scintle:plan picker's state. */
const picker = atom({ plugin: 'scintle', key: 'picker' } as const, { q: '', closed: false, ideas: [] as PickIdea[] })
const PICKER = 'scintle-plan'
/** Where you left off, shown above the prompt when a session starts in a folder Scintle knows (D34). */
const here = atom({ plugin: 'scintle', key: 'here' } as const, null as Here | null)
/** What reading recorded since the last session, or from this chat. */
const caught = atom({ plugin: 'scintle', key: 'caught' } as const, null as CaughtBand | null)
const SEEN = 'caughtSeen'

/** "new idea “Ferry delay map” · a pivot on Standup bot · +2 more" */
function caughtLine(items: readonly CaughtItem[]): string {
  const born = items.filter(i => i.type === 'born')
  const moves = items.filter(i => ['pivoted', 'spawned', 'merged', 'dropped', 'released', 'parked'].includes(i.type))
  const decided = items.filter(i => i.type === 'decided')
  const parts = [
    ...born.map(i => `new idea “${i.title}”`),
    ...moves.map(i => `${i.type} ${i.title}`),
    ...(decided.length > 0 ? [`${decided.length === 1 ? 'a decision' : `${decided.length} decisions`} on ${[...new Set(decided.map(i => i.title))].join(', ')}`] : []),
  ]
  const rest = items.length - born.length - moves.length - decided.length
  if (rest > 0) parts.push(`${rest} more update${rest === 1 ? '' : 's'}`)
  return parts.length > 2 ? `${parts.slice(0, 2).join(' · ')} · +${parts.length - 2} more` : parts.join(' · ')
}

/** Shows what reading recorded since `since`; for this chat only when `session` is given. Returns whether anything was. */
async function showCaught($: EngineInterface, lead: string, since: string, session = ''): Promise<boolean> {
  const r = (await call($, '/api/caught', { since, session })) as { caught: CaughtItem[] } | null
  if (!r || r.caught.length === 0) return false
  await update($, caught, () => ({ lead, items: r.caught }))
  return true
}

let sessionId = ''
let checkedAt = ''
let watching = false

const DID: Record<string, string> = {
  decided: 'decided', tried: 'tried', researched: 'researched', planned: 'planned', building: 'started building',
  released: 'released', refined: 'refined', narrowed: 'narrowed', widened: 'widened', attached: 'attached',
  parked: 'parked', revived: 'revived', resumed: 'resumed', renamed: 'renamed', pivoted: 'pivoted', spawned: 'spun off',
}
const STAGE: Record<string, { label: string; color: string }> = {
  seed: { label: 'Seed', color: '#8a90a3' }, exploring: { label: 'Exploring', color: '#4f9dff' },
  planned: { label: 'Planned', color: '#9d8cf5' }, building: { label: 'Building', color: '#f07a45' },
  parked: { label: 'Parked', color: '#e0b020' }, released: { label: 'Released', color: '#4edea3' },
  dropped: { label: 'Dropped', color: '#8a90a3' }, evolved: { label: 'Evolved', color: '#8590a8' },
}
const OPEN = new Set(['building', 'planned', 'exploring', 'seed'])
const GROUPS = [
  { name: 'IN PROGRESS', stages: ['building', 'planned'] }, { name: 'EXPLORING', stages: ['exploring'] }, { name: 'SEEDS', stages: ['seed'] },
  { name: 'PARKED', stages: ['parked'] }, { name: 'CLOSED', stages: ['released', 'evolved', 'dropped'] },
]
const short = (ts: string, now = Date.now()): string => {
  const d = Math.floor((now - Date.parse(ts)) / DAY)
  return d <= 0 ? 'today' : d < 30 ? `${d}d` : d < 365 ? `${Math.floor(d / 30)}mo` : `${Math.floor(d / 365)}y`
}
const ago = (ts: string, now = Date.now()): string => {
  const d = Math.floor((now - Date.parse(ts)) / DAY)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : d < 365 ? `${Math.floor(d / 30)} mo ago` : `${Math.floor(d / 365)} yr ago`
}
const matches = (i: PickIdea, q: string): boolean => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = `${i.id} ${i.title} ${i.problem}`.toLowerCase()
  return words.every(w => hay.includes(w))
}

/** Closes the picker and plans the chosen idea in this session, as if the person had typed the command. */
async function planPicked($: EngineInterface, id: string): Promise<void> {
  await $.ui.close({ id: PICKER })
  await $.command.run({ command: 'scintle:plan', args: id })
}

const facts = atom({ plugin: 'scintle', key: 'facts' } as const, {} as Record<string, Fact[]>)

// The board's dark tokens (web/src/styles.css).
const C = { ink: '#e2e2eb', muted: '#9ba1b4', faint: '#626778', rule: '#2c2f3b', accent: '#6467ff', ai: '#9d8cf5', warn: '#f5a623', good: '#4edea3' }
const ENDED: Record<string, string> = {
  released: 'released', pivoted: 'pivoted', merged: 'merged', 'not-interested': 'not interested',
  crowded: 'crowded market', 'no-demand': 'no real demand', 'not-feasible': 'not feasible', other: 'other',
}
const LABEL: Record<string, string> = {
  born: 'born', renamed: 'renamed', narrowed: 'narrowed', widened: 'widened', refined: 'refined', decided: 'a decision',
  tried: 'an experiment', pivoted: 'a pivot', spawned: 'a spin-off', merged: 'a merge', researched: 'a research report',
  planned: 'a saved plan', building: 'building started', parked: 'parked', resumed: 'resumed', released: 'released',
  dropped: 'dropped', revived: 'revived', attached: 'a linked document',
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = 86_400_000
const SHAPE = new Set(['renamed', 'narrowed', 'widened', 'pivoted'])

// A bare date ("2026-07-14") is that calendar day; read as a time it is UTC midnight, the day before west of UTC.
const dateOf = (ts: string): string => {
  const day = /^\d{4}-\d{2}-\d{2}$/.exec(ts)
  const d = new Date(day ? `${ts}T12:00:00` : ts)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const str = (ev: CardEvent, k: string): string => (typeof ev.payload[k] === 'string' ? (ev.payload[k] as string) : '')

/**
 * The one thing about an idea most likely to make someone open it, with the button's words:
 * it changed shape, else a decision in their words, else how it ended, else how long it has been quiet.
 */
function factOf(c: IdeaCard, now = Date.now()): Fact {
  const live = c.events
  const born = live.find(ev => ev.type === 'born') ?? live[0]
  const last = live.at(-1)
  const shaped = live.filter(ev => SHAPE.has(ev.type))
  const decisions = live.filter(ev => ev.type === 'decided')
  const base = { id: c.id, title: c.title }
  if (shaped.length >= 2 && born) {
    const pivot = [...shaped].reverse().find(ev => ev.type === 'pivoted')
    const text = `changed shape ${shaped.length} times since ${dateOf(born.ts)} · `
    if (pivot) return { ...base, text: `${text}pivoted into `, quote: str(pivot, 'toTitle') || 'a new idea', tail: '', cta: 'See how' }
    if (c.formerly[0]) return { ...base, text: `${text}once called `, quote: c.formerly[0], tail: '', cta: 'See how' }
    return { ...base, text: `${text}narrowed since`, quote: '', tail: '', cta: 'See how' }
  }
  const decision = decisions.at(-1)
  if (decision) {
    const more = decisions.length > 1 ? ` · ${decisions.length} decisions on record` : ''
    return { ...base, text: 'you decided ', quote: clip(str(decision, 'decision') || (decision.quote ?? ''), 60), tail: ` on ${dateOf(decision.ts)}${more}`, cta: 'See why' }
  }
  const ended = [...live].reverse().find(ev => ev.type === 'dropped' || ev.type === 'released')
  if (ended) {
    const reason = ended.type === 'dropped' && c.ended ? ENDED[c.ended] ?? c.ended : ''
    const own = clip(str(ended, 'why'), 70)
    const from = c.from[0] ? ` · it grew out of ${c.from[0].title}` : ''
    const cta = ended.type === 'released' ? 'See the story' : 'See why'
    // The person's own words beat the category they picked.
    if (own) return { ...base, text: `${ended.type} on ${dateOf(ended.ts)}: `, quote: own, tail: `${reason ? ` (${reason})` : ''}${from}`, cta }
    return { ...base, text: `${ended.type} on ${dateOf(ended.ts)}${reason ? ' as ' : ''}`, quote: reason, tail: from, cta }
  }
  if (last) {
    const quiet = Math.floor((now - Date.parse(last.ts)) / DAY)
    if (quiet >= 7) return { ...base, text: `quiet for ${quiet} days · last step: ${LABEL[last.type] ?? last.type} on ${dateOf(last.ts)}`, quote: '', tail: '', cta: 'Pick it up' }
  }
  return { ...base, text: `${c.total} moments since ${born ? dateOf(born.ts) : 'it began'} · latest: ${last ? LABEL[last.type] ?? last.type : 'born'}`, quote: '', tail: '', cta: 'Open dashboard' }
}

/** Opens the board on one idea in the person's browser. */
async function openBoard($: EngineInterface, id: string): Promise<void> {
  if (base === null && !(await connect($))) { $.ui.toast(`${MARK} isn't running. Start it with /scintle.`); return }
  const url = `http://127.0.0.1:${port}/?t=${token}#idea=${id}`
  const os = (await $.process.run(['uname'])).stdout.trim()
  const r = await $.process.run([os === 'Darwin' ? 'open' : 'xdg-open', url]).catch(() => null)
  if (!r || r.exitCode !== 0) $.ui.toast(`${MARK}: open http://127.0.0.1:${port} and pick ${id}`, { timeoutMs: 10000 })
}

/** Off when the person turned it off (/scintle companion off) or hasn't allowed reading yet; then nothing is registered or shown. */
let enabled = true
let base: string | null = null
let token = ''
let port = 0
let lastPrompt = ''
/** Ideas already pointed at in this conversation; cleared on a new session or a compaction, which may drop the pointer. */
const pointed = new Set<string>()
/** Dead ends already shown in this conversation. */
const warned = new Set<number>()

/** Scintle's data folder, found as the server finds it (server/lib/config.ts): SCINTLE_HOME, else XDG, else ~/.local/share. */
async function dataDir($: EngineInterface): Promise<string> {
  const env = async (k: string): Promise<string> => (await $.process.run(['printenv', k]).catch(() => ({ stdout: '' }))).stdout.trim()
  const own = await env('SCINTLE_HOME')
  if (own !== '') return own
  const xdg = await env('XDG_DATA_HOME')
  return xdg !== '' ? `${xdg}/scintle` : `${await env('HOME')}/.local/share/scintle`
}

/** Finds the local Scintle server and its token; false when Scintle isn't running. */
async function connect($: EngineInterface): Promise<boolean> {
  try {
    const dir = await dataDir($)
    const server = JSON.parse(await $.fs.read(`${dir}/server.json`)) as { port: number }
    token = (await $.fs.read(`${dir}/token`)).trim()
    port = server.port
    base = `http://127.0.0.1:${server.port}`
    return true
  } catch {
    base = null
    return false
  }
}

/** Calls the local Scintle server; null when it can't be reached. */
async function call($: EngineInterface, path: string, body?: unknown): Promise<unknown> {
  if (base === null && !(await connect($))) return null
  try {
    const r = await $.http.fetch(`${base}${path}`, body === undefined
      ? { headers: { 'x-scintle-token': token } }
      : { method: 'POST', headers: { 'content-type': 'application/json', 'x-scintle-token': token }, body: JSON.stringify(body) })
    return r.ok ? JSON.parse(r.text) : null
  } catch {
    base = null
    return null
  }
}

const OFFLINE = 'Scintle is not running. The user can start it with /scintle.'

export const register: Register = on => {
  // `/scintle [word]`: the same CLI the /scintle:dashboard skill runs, in the session's folder (for `add`).
  on('command.run', { command: 'scintle' }, async ($, e) => {
    const words = e.args.trim() === '' ? [] : e.args.trim().split(/\s+/)
    const r = await $.process.run(['node', `${$.plugin.root}/server/run.mjs`, 'slash', ...words], {
      cwd: await $.session.cwd(), env: { NODE_NO_WARNINGS: '1' }, timeoutMs: 30_000,
    }).catch(() => null)
    const out = r?.stdout.trim() ?? ''
    return { text: r !== null && r.exitCode === 0 && out !== '' ? out : 'Scintle needs Node.js 22.13 or newer on your PATH.' }
  })

  // /scintle:plan with no idea: a picker, so nobody has to remember an ID. With one, the command runs as written.
  on('command.run', { command: 'scintle:plan' }, async ($, e, next) => {
    if (e.args.trim() !== '') return next(e)
    const r = (await call($, '/api/picker')) as { ideas: PickIdea[] } | null
    if (r === null) return { text: `${MARK} isn't running. Open the board once with /scintle, then try again.` }
    if (r.ideas.length === 0) return { text: `${MARK} has no ideas yet. Open the board with /scintle.` }
    await update($, picker, () => ({ q: '', closed: false, ideas: r.ideas }))
    void $.ui.open({ id: PICKER, title: '✦ Plan an idea', focus: true, closeOnEscape: true })
    return { text: 'Pick an idea to plan.' }
  })

  // A command palette: one line per idea, grouped by stage, the problem shown only under the pointer.
  on('ui.render', { component: 'Pane', requestId: PICKER }, async ($, e) => {
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const p = await read($, picker)
    const W = Math.max(30, e.props.bodyColumns)
    const searching = p.q.trim() !== ''
    const found = p.ideas.filter(i => matches(i, p.q))
    // A search names what it wants, so it reaches parked and closed ideas too.
    const shown = p.closed || searching ? found : found.filter(i => OPEN.has(i.stage))
    const hidden = found.length - shown.length
    const groups = GROUPS.map(g => ({ ...g, ideas: shown.filter(i => g.stages.includes(i.stage)) })).filter(g => g.ideas.length > 0)
    let n = 0
    const row = (i: PickIdea): JSX.Element => {
      const st = STAGE[i.stage] ?? { label: i.stage, color: C.muted }
      const key = n < 9 ? String(n + 1) : undefined
      n++
      const age = short(i.moved)
      const pick = (): Promise<void> => planPicked($, i.id)
      return (
        <Box key={`row-${i.id}`} flexDirection="column" hover={{ backgroundColor: '#1c1f2b' }}>
          <Box justifyContent="space-between" gap={2}>
            <Button plain key={`pick-${i.id}`} label={`Plan ${i.title}`} {...(key ? { hotkey: key } : {})} onPress={pick}>
              {/* Rows past 9 have no "n: " from the engine; pad them so the dots line up. */}
              <Text>{key ? '' : '   '}</Text><Text color={st.color}>● </Text><Text color={C.ink} bold>{clip(i.title, W - 14)}</Text>
            </Button>
            <Button plain key={`age-${i.id}`} label={`Plan ${i.title}`} onPress={pick}><Text color={C.faint}>{age}</Text></Button>
          </Box>
          {/* The whole highlighted row picks: the description is a button doing the same. */}
          <Box display="none" hover={{ display: 'flex' }} paddingLeft={5}>
            <Button plain key={`desc-${i.id}`} label={`Plan ${i.title}`} onPress={pick}>
              <Text color={C.muted} italic>{clip(i.problem || 'No problem statement yet.', (W - 6) * 2)}</Text>
            </Button>
          </Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="column" width={W} gap={1}>
        <Box justifyContent="space-between">
          <Text color={C.ai} bold>✦ Plan an idea</Text>
          <Text color={C.faint}>{shown.length} of {p.ideas.length}</Text>
        </Box>
        <Box borderStyle="round" borderColor={searching ? C.ai : C.rule} paddingX={1}>
          <Text color={C.faint}>⌕ </Text>
          <Input key="q" autoFocus placeholder="Search ideas" submitLabel="plan top match" value={p.q}
            onInput={v => update($, picker, s => ({ ...s, q: v }))}
            onSubmit={v => { const first = p.ideas.find(i => matches(i, v)); if (first) void planPicked($, first.id) }} />
        </Box>
        {groups.length === 0 && <Text color={C.faint}>No idea matches “{p.q}”.</Text>}
        {groups.map(g => (
          <Box key={`g-${g.name}`} flexDirection="column">
            <Text color={C.faint} bold>{g.name} <Text color={C.rule}>· {g.ideas.length}</Text></Text>
            {g.ideas.map(row)}
          </Box>
        ))}
        <Box justifyContent="space-between">
          {hidden > 0
            ? <Button plain dimColor key="closed" label={`Show ${hidden} parked or closed`} onPress={() => update($, picker, s => ({ ...s, closed: true }))}><Text color={C.faint}>+ {hidden} parked or closed</Text></Button>
            : <Text> </Text>}
          <Text color={C.faint}>hover for details · esc</Text>
        </Box>
      </Box>
    )
  })

  // At session start, one row above the prompt: where you left off in this folder, and a way straight back in.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const band = await read($, here)
    const got = await read($, caught)
    if ((band === null && got === null) || e.props.hasSurvey) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const caughtRow = got === null ? null : (
      <Box gap={2} key="caught">
        <Text><Text color={C.good} bold>✦ </Text><Text color={C.faint}>{got.lead}: </Text><Text color={C.ink}>{caughtLine(got.items)}</Text></Text>
        <Button plain key="caught-see" label="See it on the board" onPress={() => openBoard($, got.items[got.items.length - 1]?.id ?? '')}>
          <Text backgroundColor={C.good} color="#0c0e14" bold>{' See '}</Text>
        </Button>
        <Button plain dimColor key="caught-dismiss" label="Dismiss" onPress={() => update($, caught, () => null)}><Text color={C.faint}>×</Text></Button>
      </Box>
    )
    if (band === null) return caughtRow as JSX.Element
    const pickUp = async (): Promise<void> => {
      await update($, here, () => null)
      await $.prompt.fill({ text: `Let's pick up ${band.title} (${band.id}) where I left off.` })
    }
    const lead = band.others > 0 ? 'Last here' : 'Where you left off'
    const did = DID[band.step] ?? band.step
    const room = Math.max(20, ((e.props as { bodyColumns?: number }).bodyColumns ?? 100) - band.title.length - did.length - 50)
    const hereRow = (
      <Box gap={2} key="here">
        <Text>
          <Text color={C.ai} bold>✦ </Text><Text color={C.faint}>{lead}: </Text><Text color={C.ink} bold>{band.title}</Text>
          <Text color={C.muted}> · {did}</Text>
          {band.detail ? <Text color={C.ink} italic> “{clip(band.detail, room)}”</Text> : ''}
          {band.at ? <Text color={C.faint}> · {short(band.at)}</Text> : ''}
        </Text>
        <Button plain key="pickup" label={`Pick up ${band.title}`} onPress={pickUp}>
          <Text backgroundColor={C.accent} color="#ffffff" bold>{' Pick up '}</Text>
        </Button>
        <Button plain dimColor key="board" label={`Open ${band.title} on the board`} onPress={() => openBoard($, band.id)}><Text color={C.muted}>↗ Board</Text></Button>
        <Button plain dimColor key="dismiss" label="Dismiss" onPress={() => update($, here, () => null)}><Text color={C.faint}>×</Text></Button>
      </Box>
    )
    return caughtRow === null ? hereRow : <Box flexDirection="column">{hereRow}{caughtRow}</Box>
  })

  // Under a prompt whose idea Claude read: the most interesting thing about it, and the way to the dashboard.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const found = (await read($, facts))[e.props.text]
    if (!found || found.length === 0) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {await next(e)}
        {found.map(f => (
          <Box key={`fact-${f.id}${f.warn ? '-warn' : ''}`} flexWrap="wrap" columnGap={2} paddingLeft={2} marginTop={1}>
            <Text>
              {f.warn ? <Text color={C.warn} bold>⚠ {f.title}</Text> : <Text color={C.ai} bold>✦ {f.title}</Text>}<Text color={C.muted}> {f.text}</Text>
              {f.quote ? <Text color={C.ink} bold italic>“{f.quote}”</Text> : ''}<Text color={C.muted}>{f.tail ?? ''}</Text>
            </Text>
            <Button plain key={`open-${f.id}${f.warn ? '-warn' : ''}`} label={`${f.cta}: open ${f.title} in Scintle`} onPress={() => openBoard($, f.id)}>
              <Text backgroundColor={f.warn ? C.warn : C.accent} color={f.warn ? '#0c0e14' : '#ffffff'} bold>{` ↗ ${f.cta} `}</Text>
            </Button>
          </Box>
        ))}
      </Box>
    )
  })

  on('session.compact', async ($, e, next) => {
    pointed.clear()
    warned.clear()
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    pointed.clear()
    warned.clear()
    const result = await next(e)
    // The server starts alongside this session (SessionStart hook); give it a moment before asking whether the companion is on.
    let state: { on: boolean } | null = null
    for (let i = 0; i < 6 && state === null; i++) {
      state = (await call($, '/api/companion')) as { on: boolean } | null
      if (state === null) await $.clock.sleep(500)
    }
    enabled = state?.on ?? true
    // `/scintle` with no prefix: a plugin skill is always listed as scintle:<name>, a mod's command is not.
    await $.command.register({
      name: 'scintle',
      description: 'Open your Scintle idea board, or: add, sync, stop, companion, telemetry, forget',
      argumentHint: '[add | sync | stop | companion | telemetry | forget]',
    })
    if (!enabled) return result
    await $.tool.register({
      name: 'search_ideas',
      description: "Search the user's Scintle idea board: every idea they have had in past Claude Code sessions and documents, with its stage (seed, exploring, planned, building, parked, released, dropped) and why it ended. Use it whenever the user asks about their past ideas, projects, plans or what they tried, by topic or by name. Pass several related words to cover synonyms (e.g. 'music raga singing riyaz'). An empty query lists every idea.",
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words to look for; several related words work best.' } }, required: ['query'] },
    })
    await $.tool.register({
      name: 'idea_history',
      description: "The full history of one idea on the user's Scintle board, by its ID (e.g. I-014): how it started, renames, narrowing, decisions, what was tried and dropped, linked documents, and how it ended, with the quotes behind each step. Use it before answering in depth about one idea or planning work on it.",
      inputSchema: { type: 'object', properties: { id: { type: 'string', pattern: '^I-\\d+$' } }, required: ['id'] },
    })
    await $.tool.register({
      name: 'flag_dead_end',
      description: "Show the user that what is being proposed or planned repeats something they already tried and dropped, from their Scintle board. Pass the [#id] that idea_history printed next to a dropped approach or idea. Call it only for a real repeat, not for a related topic, and at most once per id in a conversation.",
      inputSchema: { type: 'object', properties: { event_id: { type: 'integer', minimum: 1 } }, required: ['event_id'] },
    })
    const found = (await call($, '/api/here', { cwd: e.cwd })) as { idea: Omit<Here, 'others'> | null; others: number } | null
    // Not `h`: JSX compiles to calls of the global `h`.
    await update($, here, () => (found?.idea ? { ...found.idea, others: found.others } : null))
    // What reading caught since the last session; and from now on, what it catches from this one.
    sessionId = await $.session.id()
    const now = new Date().toISOString()
    const seen = await $.store.get(SEEN)
    await update($, caught, () => null)
    if (typeof seen === 'string') await showCaught($, 'Since last time', seen)
    await $.store.set(SEEN, now)
    checkedAt = now
    if (!watching) {
      watching = true
      // A local request a minute: reading lands in batches, so this is when "caught from this chat" shows up.
      $.clock.every(60_000, async () => {
        if (!enabled) return
        const at = new Date().toISOString()
        if (await showCaught($, 'Caught from this chat', checkedAt, sessionId)) await $.store.set(SEEN, at)
        checkedAt = at
      })
    }
    return result
  })

  on('tool.call', { tool: /^mcp__scintle__search_ideas$/ }, async ($, e) => {
    const r = (await call($, '/api/search', { query: String((e as { query?: unknown }).query ?? '') })) as { total: number; ideas: { id: string; title: string; stage: string; ended: string | null; problem: string; last: string }[] } | null
    if (r === null) return { result: OFFLINE }
    if (r.ideas.length === 0) return { result: 'No ideas on the board match those words. Try other or broader words, or an empty query for every idea.' }
    const lines = r.ideas.map(i => `- ${i.id} · ${i.title} · ${i.stage}${i.ended ? ` (${i.ended})` : ''} · last moved ${i.last}\n  ${i.problem}`)
    return { result: `${r.total} idea${r.total === 1 ? '' : 's'} match${r.total === 1 ? 'es' : ''} (best first; a match is a shared word, so check relevance):\n${lines.join('\n')}` }
  })

  on('tool.call', { tool: /^mcp__scintle__idea_history$/ }, async ($, e) => {
    const id = String((e as { id?: unknown }).id ?? '')
    if (!/^I-\d+$/.test(id)) return { result: 'Give an idea ID like I-014; search_ideas finds them.' }
    const r = (await call($, `/api/history/${id}`)) as { text: string | null } | null
    if (r === null) return { result: OFFLINE }
    if (r.text === null) return { result: `There is no idea ${id} on the board.` }
    // Claude judged the prompt to be about this idea: say so under the prompt, with the way to the dashboard.
    const c = (await call($, `/api/card/${id}`)) as IdeaCard | null
    if (c && 'title' in c && lastPrompt !== '') {
      const f = factOf(c)
      await update($, facts, map => ({ ...map, [lastPrompt]: [...(map[lastPrompt] ?? []).filter(x => x.id !== id || x.warn), f].slice(-3) }))
      $.ui.toast(`${MARK} found ${c.title}`, { timeoutMs: 6000 })
    }
    return { result: r.text }
  })

  // A dead end Claude spotted: the line shows the board's own record, never Claude's words (D33).
  on('tool.call', { tool: /^mcp__scintle__flag_dead_end$/ }, async ($, e) => {
    const id = Number((e as { event_id?: unknown }).event_id)
    if (!Number.isInteger(id) || id < 1) return { result: 'Pass the number from a [#id] in idea_history.' }
    if (warned.has(id)) return { result: 'Already shown to the user in this conversation.' }
    const d = (await call($, `/api/dead-end/${id}`)) as { ideaId: string; title: string; what: string; why: string; day: string } | { ok: false; error: string } | null
    if (d === null) return { result: OFFLINE }
    if (!('ideaId' in d)) return { result: `Not shown: #${id} is ${d.error}. Only ids marked dropped in idea_history count.` }
    warned.add(id)
    const same = d.what === d.title
    const f: Fact = {
      id: d.ideaId, title: d.title, warn: true,
      text: same ? 'you dropped this idea on ' : 'you tried ', quote: same ? '' : clip(d.what, 70),
      tail: `${same ? dateOf(d.day) : ` on ${dateOf(d.day)} and dropped it`}${d.why ? `: ${clip(d.why, 90)}` : ''}`,
      cta: 'See why',
    }
    if (lastPrompt !== '') await update($, facts, map => ({ ...map, [lastPrompt]: [...(map[lastPrompt] ?? []), f].slice(-3) }))
    return { result: `Shown to the user under their prompt: ${same ? `the idea ${d.title} was dropped` : `"${d.what}" was tried and dropped`} on ${d.day}${d.why ? ` (${d.why})` : ''}. Say so in your answer.` }
  })

  // A plan approved in plan mode: recorded on its idea now, not when the session is next read (D35).
  on('tool.call', { tool: 'ExitPlanMode' }, async ($, e, next) => {
    const r = await next(e)
    // The approved plan comes back on the result (with any edits the person made); older builds put it on the input.
    const out = (r as { result?: { plan?: unknown } }).result
    const plan = typeof out?.plan === 'string' ? out.plan : (e as { plan?: unknown }).plan
    if (!enabled || 'deny' in r || (r as { isError?: boolean }).isError === true || typeof plan !== 'string' || plan.trim() === '') return r
    const done = (await call($, '/api/plan-done', { session: sessionId || await $.session.id(), plan })) as { idea: { id: string; title: string } | null } | null
    if (done?.idea && lastPrompt !== '') {
      const f: Fact = { id: done.idea.id, title: done.idea.title, text: 'plan recorded on the board', quote: '', tail: '', cta: 'See it' }
      await update($, facts, map => ({ ...map, [lastPrompt]: [...(map[lastPrompt] ?? []).filter(x => x.id !== f.id || x.warn), f].slice(-3) }))
    }
    return r
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.isMeta || e.origin.kind !== 'composer') return next(e)
    if ((await read($, here)) !== null) await update($, here, () => null)
    if (e.command || e.text.trim().startsWith('/')) return next(e)
    lastPrompt = e.text
    const m = (await call($, '/api/context', { text: e.text, skip: [...pointed] })) as Match | null
    if (!m || m.ideas.length === 0) return next(e)
    for (const i of m.ideas) pointed.add(i.id)
    return next({ ...e, context: [...(e.context ?? []), m.context] })
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!enabled || e.agentId !== undefined || e.isAborted || !('answer' in e)) return result
    const m = (await call($, '/api/context', { text: `${lastPrompt}\n${e.answer}`, skip: [] })) as Match | null
    const first = m?.ideas[0]
    if (m && m.ideas.length === 1 && first) void $.prompt.suggest({ text: `/scintle:plan ${first.id}` })
    return result
  })
}

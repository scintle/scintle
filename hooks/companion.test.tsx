import { expect, test } from 'claude-code/testing'

const FACT = { id: 'I-002', title: 'Trail alerts', text: 'changed shape 3 times since Jul 2 · once called ', quote: 'Trail closures', tail: '', cta: 'See how' }
const ROW = {
  plugin: 'scintle', component: 'UserMessage',
  props: { text: 'where did I leave off on trail alerts?', origin: { kind: 'composer' }, isExpanded: false },
} as const

test('a prompt whose idea Claude read gets the line and its button, on every surface', async ($, on) => {
  on('state.get', (_, e) => ({ value: { value: (e as { key: string }).key === 'facts' ? { [ROW.props.text]: [FACT] } : undefined, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'the prompt' }))
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...ROW, surface })
    expect(await ui.find({ type: 'Text', text: /changed shape 3 times/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^“Trail closures”$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'open-I-002' })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /the prompt/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('any other prompt is drawn as the engine draws it', async ($, on) => {
  on('state.get', () => ({ value: { value: {}, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'the prompt' }))
  const ui = await $.ui.mount({ ...ROW, surface: 'terminal' })
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('a dead end Claude flagged is drawn as a warning, beside the usual line', async ($, on) => {
  const warn = { id: 'I-002', title: 'Trail alerts', warn: true, text: 'you tried ', quote: 'a Slack bot', tail: ' on Jul 14 and dropped it: nobody answered', cta: 'See why' }
  on('state.get', (_, e) => ({ value: { value: (e as { key: string }).key === 'facts' ? { [ROW.props.text]: [FACT, warn] } : undefined, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'the prompt' }))
  const ui = await $.ui.mount({ ...ROW, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /⚠ Trail alerts/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /^“a Slack bot”$/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'open-I-002-warn' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'open-I-002' })).toBeTruthy()
  await ui.unmount()
})

const IDEAS = [
  { id: 'I-001', title: 'Trail alerts', stage: 'building', ended: null, problem: 'Hikers miss trail closures', moved: '2026-11-20T10:00:00.000Z', last: 'building' },
  { id: 'I-002', title: 'Recipe scaler', stage: 'planned', ended: null, problem: 'Cooks rescale recipes by hand', moved: '2026-11-18T10:00:00.000Z', last: 'planned' },
  { id: 'I-003', title: 'Plant reminders', stage: 'dropped', ended: 'crowded', problem: 'People forget to water plants', moved: '2026-08-07T10:00:00.000Z', last: 'dropped' },
]
const PICKER = {
  plugin: 'scintle', component: 'Pane', requestId: 'scintle-plan',
  props: { title: '✦ Plan an idea', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const
const seed = (q: string, closed = false) => (_: unknown, e: unknown) =>
  ({ value: { value: (e as { key: string }).key === 'picker' ? { q, closed, ideas: IDEAS } : undefined, version: 1 } })

test('the plan picker lists open ideas with number keys, on every surface', async ($, on) => {
  on('state.get', seed(''))
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PICKER, surface })
    expect(await ui.find({ type: 'Button', key: 'pick-I-001' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'pick-I-002' })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'pick-I-003' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /\+ 1 parked or closed/ })).toBeTruthy()
    await ui.unmount()
  }
})

test('a search filters the picker and reaches closed ideas', async ($, on) => {
  on('state.get', seed('plant'))
  const ui = await $.ui.mount({ ...PICKER, surface: 'terminal' })
  expect(await ui.find({ type: 'Button', key: 'pick-I-003' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'pick-I-001' })).toBeUndefined()
  await ui.unmount()
})

test('/scintle:plan with an idea runs as written', async ($, on) => {
  on('command.run', () => ({ text: 'brief for I-002' }))
  const r = await $.command.run({ command: 'scintle:plan', args: 'I-002' })
  expect(r.text).toBe('brief for I-002')
})

const BAND = { plugin: 'scintle', component: 'AbovePrompt', props: { bodyColumns: 120 } } as const
const HERE = { id: 'I-002', title: 'Trail alerts', stage: 'building', step: 'decided', detail: 'push notifications only', at: '2026-11-22T10:00:00.000Z', others: 0 }

test('a session in a known folder starts with where you left off, and a way back in', async ($, on) => {
  on('state.get', (_, e) => ({ value: { value: (e as { key: string }).key === 'here' ? HERE : undefined, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine band' }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Where you left off/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /“push notifications only”/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', key: 'pickup' })).toBeTruthy()
    await ui.unmount()
  }
})

test('the band says "last here" in a folder shared by several ideas, and nothing once dismissed', async ($, on) => {
  let value: unknown = { ...HERE, others: 4 }
  on('state.get', (_, e) => ({ value: { value: (e as { key: string }).key === 'here' ? value : undefined, version: 1 } }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine band' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Last here/ })).toBeTruthy()
  await ui.unmount()
  value = null
  const quiet = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await quiet.find({ type: 'Button', key: 'pickup' })).toBeUndefined()
  await quiet.unmount()
})

test('what reading caught shows above the prompt, beside where you left off', async ($, on) => {
  const got = { lead: 'since your last session', items: [
    { id: 'I-009', title: 'Ferry delay map', type: 'born', detail: '' },
    { id: 'I-002', title: 'Trail alerts', type: 'decided', detail: 'fridays' },
  ] }
  on('state.get', (_, e) => {
    const key = (e as { key: string }).key
    return { value: { value: key === 'here' ? HERE : key === 'caught' ? got : undefined, version: 1 } }
  })
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine band' }))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /a decision on Trail alerts · a new idea “Ferry delay map”/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Scintle saved since your last session/ })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'caught-see' })).toBeTruthy()
  expect(await ui.find({ type: 'Button', key: 'pickup' })).toBeTruthy()
  await ui.unmount()
})

export type Pointer = { id: string; title: string }

export type CardEvent = {
  id: number; ts: string; type: string; payload: Record<string, unknown>
  quote: string | null; by: string | null; origin: string; state: string
}
export type CardLink = { id: string; title: string; stage: string; type: string }
export type IdeaCard = {
  id: string; title: string; stage: string; ended: string | null; problem: string
  formerly: string[]; from: CardLink[]; to: CardLink[]; events: CardEvent[]; total: number
}
/** What the line under a prompt says about one idea: plain words, the quoted part drawn bright, the rest, and its button's words. */
export type Fact = { id: string; title: string; text: string; quote: string; tail: string; cta: string; /** A dead end Claude flagged (D33). */ warn?: true }

/** One idea as the plan picker lists it. */
export type PickIdea = { id: string; title: string; stage: string; ended: string | null; problem: string; moved: string; last: string }
export type Picker = { q: string; closed: boolean; ideas: PickIdea[] }

/** Where you left off in this session's folder (D34). `others` > 0: an umbrella folder, so "last here". */
export type Here = { id: string; title: string; stage: string; step: string; detail: string; at: string; others: number }

/** What reading recorded, for the band: since the last session, or from this chat (D35). */
export type CaughtItem = { id: string; title: string; type: string; detail: string }
export type CaughtBand = { lead: string; items: CaughtItem[] }

declare module 'claude-code' {
  interface PluginState {
    scintle: {
      /** Prompt text → what Scintle found for it, drawn under that prompt. */
      facts: Record<string, Fact[]>
      /** The /scintle:plan picker: what is typed, whether closed ideas show, and the list. */
      picker: Picker
      /** The band above the prompt at session start, until the first prompt or a dismissal. */
      here: Here | null
      /** What reading just recorded, shown above the prompt until dismissed or the next one replaces it. */
      caught: CaughtBand | null
    }
  }
}

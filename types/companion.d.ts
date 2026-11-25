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

declare module 'claude-code' {
  interface PluginState {
    scintle: {
      /** Prompt text → what Scintle found for it, drawn under that prompt. */
      facts: Record<string, Fact[]>
      /** The /scintle:plan picker: what is typed, whether closed ideas show, and the list. */
      picker: Picker
    }
  }
}

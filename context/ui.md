# Board UI

The board is React + d3 + Vite in `web/`. d3 does the maths (`d3-scale`, `d3-zoom`, `d3-force`, `d3-shape`); React renders all SVG and DOM. State lives in one Zustand store, fed by a single SSE stream.

## App bar

- **Left:** the Scintle mark (three strands merging into a spark), then the wordmark, then the project scope.
- **Centre:** the segmented view switcher: Board · River · Constellation.
- **Right:**
  - the "Ask the board ⌘K" field;
  - **New Idea** (the primary button);
  - a live indicator (the dot pulses while extracting).
- It's 56px high on a 12-column grid and stays put, with no shift between views.

## Views

- **Board** (default)
  - Columns: Seed · Exploring · Planned · Building, plus Parked; closed ideas sit in a collapsed shelf.
  - Each card shows:
    - the title, with the trail of earlier names in small type;
    - a "where you left off" line, taken from the last event;
    - last activity, as relative time;
    - the source-chat state;
    - a dotted border if any of its events is still dotted.
- **River** (ported from the mock)
  - Time runs across and each idea has a lane; forks and merges are drawn as curves.
  - Semantic zoom: hour ticks; event titles appear at k ≥ 2.2 and quotes at k ≥ 6.
  - Lane names stick to the edge, and a minimap shows the viewport on the strip.
  - A pink scrub handle travels back in time; hold Shift to see later events as ghosts.
- **Constellation** (ported)
  - A seeded force layout that remembers pinned positions.
  - Labels are placed to avoid collisions; link labels appear only on hover or select.
  - A depth slider controls how much of the neighbourhood shows.
- **Shared across views**
  - Path lighting: Shift-click two ideas to light the path between them.
  - A staged morph when switching views.
  - Zoom controls.

## Idea panel (right side)

- The story: the trail of names, the problem as it stands now, and the lineage chain.
- The timeline:
  - filters, and "N days quiet" dividers between gaps;
  - clicking an event opens a card with its quote, its context excerpt, the source-chat state, and correction actions;
  - ←/→ step through events;
  - every correction shows an undo toast.
- Helpers by stage:
  - Plan implementation, Research, Park, Release, Drop, Revive.
  - **Plan implementation** shows the brief with **Copy `/scintle:plan I-042`** and **Open in new terminal**.

## ⌘K command bar

- Fixed phrasings go first: "where did X end up", "how did X start", "path X to Y", "what's quiet", "today", "new idea …".
- Anything else falls back to the model, which returns commands from the same small vocabulary.

## Quality bar

- Colour tokens defined on `:root`, with a dark theme.
- Every action is reachable from the keyboard.
- `prefers-reduced-motion` turns off the morph and replay animations.
- Every panel has an empty, loading and error state.
- Stays smooth with 200 ideas and 5,000 events.

## Source-chat states (on event cards)

| State | What the card shows |
|---|---|
| live | "Open source chat" |
| expiring (day 25 or later of 30) | "Expires in N days" |
| deleted | "View saved excerpt", tagged "source chat deleted · 30-day cleanup" |
| nothing saved | "Source no longer available" |

---
title: The board and its views
description: Keep the board beside Claude Code, then find your way around Lineage, Board and Constellation.
---

## Keep it beside Claude Code

`/scintle` prints a local link (`http://127.0.0.1:4873/…`) and opens it. Where to put it depends on where you run Claude Code.

**Claude desktop app: the Browser pane.** Click the link `/scintle` prints. The first time you click a link in chat, the app asks whether links open in the Browser pane or your default browser; choose the Browser pane. Drag the pane beside the chat, or click **Minimize** in its header to keep it floating small in a corner. The pane uses its own browser profile.

**VS Code or Cursor: the Integrated Browser.** Run `/scintle` in the integrated terminal and click the link; localhost links open in the editor's Integrated Browser by default. Drag its tab beside your terminal. If it opens elsewhere, check the `workbench.browser.openLocalhostLinks` setting.

**iTerm2 (macOS): a browser pane in your split.** Install iTerm2's browser plugin, create a profile under **Settings › Profiles › General** with its type set to **Web Browser**, split your window with that profile, and open the link in it.

**Other terminals** (Terminal.app, Warp, Ghostty, kitty, WezTerm) open links in your usual browser. Put that window beside the terminal: on macOS, hover the green button and choose a tile layout.

Sources, checked 2026-11-23: [Claude Code desktop](https://code.claude.com/docs/en/desktop), [VS Code Integrated Browser](https://code.visualstudio.com/docs/debugtest/integrated-browser), [iTerm2 web browser](https://iterm2.com/documentation-web.html).

## Lineage (the default)

Where did each idea come from, and where did it end up? Lineage has two lenses:

- **River**: one lane per idea along a time axis. Pivots and spawns branch into new lanes; merges join them; an ended lane says how it ended.
- **Constellation**: ideas as a graph of what's related to what. Drag a node to pin it.

Click any idea to open its panel: its names over time, the problem it's solving now, its lineage and its full timeline. **‹ All ideas** (or Esc) goes back.

### Replay and scrubbing

Press play to replay your history: the right panel becomes a running feed of the main moments, bigger events in bigger type. Drag the strip under the canvas to scrub forward and back in time; the board shows what you knew at that moment.

### Filters

Status chips narrow the lanes (active, parked, ended), and under **Ended** you can filter by reason. A date range rescales the axis. The project menu shows one project's ideas.

## Board

Lifecycle columns, from seed through exploring, planned and building. Each card shows where you left off, when it last moved, and whether its source chat still exists. Parked and ended ideas sit to the side, with a pill saying why an idea ended.

## Keyboard

- `⌘K` (or `Ctrl K`): ask the board, for example "where did the ledger idea end up".
- `n`: a new idea by hand.
- `Esc`: close the panel.
- `←` / `→`: step through an idea's timeline.

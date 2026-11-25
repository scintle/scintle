---
title: Known gaps in the beta
description: What Scintle hasn't been tested on yet, so nothing surprises you.
---

Scintle is in beta. These parts are built but haven't been run enough to trust fully:

- **Plan mode, live.** `/scintle:plan` and the way back to the timeline are tested against recorded sessions, not yet in many live interactive ones.
- **Research** from an idea's panel, and **Ask Claude** in `⌘K`, have barely been used against the real model.
- **Linux** is supported but has had less use than macOS. **Windows** isn't supported.
- **Grouping quality on other people's history.** How ideas get grouped has been tuned on a small number of histories. Expect some ideas merged that shouldn't be, or split that should be one; the [wrong idea report](https://github.com/scintle/scintle/issues/new?template=wrong-idea.yml) is the most useful thing you can send.
- **Other agents.** Only Claude Code sessions are read today.

Found something else? [Tell us](https://github.com/scintle/scintle/issues/new/choose).

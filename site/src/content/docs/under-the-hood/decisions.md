---
title: Design decisions
description: Where to find why Scintle works the way it does.
---

Every choice someone could reasonably undo is written down, dated, with its reason and its cost, in [`context/decisions.md`](https://github.com/scintle/scintle/blob/main/context/decisions.md). A few that shape what you see:

- **Ended ideas carry a reason** (D24), and "Not interested" is only ever set by you.
- **Scintle reads only Claude's folder unless you add one** (D25).
- **Usage counting is opt-in, with no ID, and only totals are kept** (D26).
- **Your data stays in `~/.local/share/scintle`**, so uninstalling never deletes your history by accident (D27).

The product spec, data model and extraction rules live next to it in [`context/`](https://github.com/scintle/scintle/tree/main/context).

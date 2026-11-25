---
title: Updating and uninstalling
description: Get new versions, and remove Scintle cleanly.
---

## Updating

Claude Code auto-updates plugins only from Anthropic's own marketplaces. For Scintle, either:

- **Turn on auto-update**: run `/plugin`, open **Marketplaces**, pick **scintle**, turn on auto-update. New versions arrive a few minutes into a session.
- **Update by hand**: `claude plugin update scintle@scintle`, then start a new session (or run `/reload-plugins`).

Your ideas are kept across updates.

## Uninstalling

```sh
claude plugin uninstall scintle@scintle
```

This removes the plugin but **not your data**, on purpose: a reinstall shouldn't cost you your ideas' history. To delete the data too, run `/scintle:forget` **before** uninstalling, or afterwards:

```sh
rm -rf ~/.local/share/scintle
```

The background server stops by itself within 6 hours once nothing uses it, or run `/scintle:stop` before uninstalling.

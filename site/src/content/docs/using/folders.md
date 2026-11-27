---
title: Folders Scintle reads
description: Add a folder of plans and specs so its documents become part of your ideas' history.
---

Scintle always reads Claude's own folder, `~/.claude`: your sessions and the plans Claude saves. Nothing else on your disk is read unless you add it, like opening a folder in an editor.

## Why add a folder

Claude Code deletes session transcripts after 30 days by default. Plans, specs and reports you keep in a project outlive them. Adding the folder lets those documents count as history: an idea from last year's spec can come back.

## Add one

- On the board: the project menu, then **Folders Scintle reads**, then type a path.
- Or, in a Claude Code session inside that folder: `/scintle add`.

## What's read inside it

- Top-level Markdown files (minus boilerplate such as `CHANGELOG`, `LICENSE` and `CLAUDE.md`).
- Folders named like plans: `plans`, `specs`, `context`, `rfcs`, `adr`, `decisions`, `proposals`, `reports`.
- Files named like plans anywhere: `PLAN.md`, `SPEC.md`, `ROADMAP.md`, `*-plan.md`, `*-prd.md` and similar.

Each document is read once, as a short digest (title, headings, the opening of each section, no code), and again only if it changes. A generic `docs/` folder is not read wholesale. Documents written during a session that still exists are skipped: the session already tells that story.

## Remove one

**Remove** in the same dialog stops reading the folder and forgets the text read from it. Ideas and their events stay.

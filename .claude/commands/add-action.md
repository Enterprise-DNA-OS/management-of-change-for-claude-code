---
description: Add an action to a change: before start-up (training, procedures, checks) or after.
---

Read CLAUDE.md. Add an action to a change: before start-up (training, procedures, checks) or after.

Run `npm run moc -- add-action <change> --phase=pre_startup|post_startup --kind=procedure|drawing|training|inspection|pssr_item|communication|other --description= --owner= --due=YYYY-MM-DD [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Before start-up actions block the pre-start-up review and start-up.

---
description: Record the pre-start-up safety review.
---

Read CLAUDE.md. Record the pre-start-up safety review.

Run `npm run moc -- pssr <change> --by= --note= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Refused while sign-offs or pre-start-up actions are open. Read the change first and list what was checked.

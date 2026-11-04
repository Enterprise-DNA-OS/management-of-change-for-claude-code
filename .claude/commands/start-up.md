---
description: Put an approved change into operation.
---

Read CLAUDE.md. Put an approved change into operation.

Run `npm run moc -- start-up <change> [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Every gate is checked: sign-offs, pre-start-up actions, the review, the safety case notice, the temporary expiry. If it refuses, report the blockers as a to-do list.

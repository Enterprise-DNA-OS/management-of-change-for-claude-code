---
description: Close out a change in operation.
---

Read CLAUDE.md. Close out a change in operation.

Run `npm run moc -- close <change> --note= [--outcome=reverted|made_permanent] [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Every action must be done. A temporary change needs its outcome: reverted or made_permanent.

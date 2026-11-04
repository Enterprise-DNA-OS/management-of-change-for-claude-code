---
description: Extend a temporary change with a reason.
---

Read CLAUDE.md. Extend a temporary change with a reason.

Run `npm run moc -- extend <change> --to=YYYY-MM-DD --reason= --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

More than one extension is flagged by /compliance: suggest raising a permanent change instead.

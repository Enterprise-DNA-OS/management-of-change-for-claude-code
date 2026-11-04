---
description: Reject a change that is not yet in operation.
---

Read CLAUDE.md. Reject a change that is not yet in operation.

Run `npm run moc -- reject <change> --reason= --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

---
description: Record that the regulator was notified about a safety case change.
---

Read CLAUDE.md. Record that the regulator was notified about a safety case change.

Run `npm run moc -- notify-regulator <change> --on=YYYY-MM-DD --reference= --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

This records a notice that was given. It never sends one.

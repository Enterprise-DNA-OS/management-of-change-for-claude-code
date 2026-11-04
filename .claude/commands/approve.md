---
description: Record a sign-off (or a rejection) for one role.
---

Read CLAUDE.md. Record a sign-off (or a rejection) for one role.

Run `npm run moc -- approve <change> --role=technical|operations|safety|site_manager --person= [--decision=approved|rejected] [--on=YYYY-MM-DD] [--note=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Record only a decision the person actually made; the actor and the person are both logged. A decision is never overwritten.

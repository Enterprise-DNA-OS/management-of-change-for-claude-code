---
description: Import change and action exports from Intelex.
---

Read CLAUDE.md. Import change and action exports from Intelex.

Run `npm run moc -- import intelex --changes=changes.csv [--actions=actions.csv] [--site=CODE] [--dry-run] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Read docs/replace-intelex.md first. Always run with --dry-run, show the counts and problems, then import within the operator's authorised migration. Never guess a column.

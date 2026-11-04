---
description: Mark an action done with its evidence.
---

Read CLAUDE.md. Mark an action done with its evidence.

Run `npm run moc -- complete-action <action code> --evidence= [--on=YYYY-MM-DD] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Evidence is required: a document revision, a training record, a test sheet.

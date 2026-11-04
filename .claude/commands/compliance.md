---
description: Check the records against the rules in docs/compliance.md.
---

Read CLAUDE.md. Check the records against the rules in docs/compliance.md.

Run `npm run moc -- compliance`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read docs/compliance.md first. Report as a table: rule, change, finding, source. Breaches first. Draft the fix (the action to add, the sign-off to chase); never close a finding by editing history. Nothing here is legal advice.

---
description: Show temporary and emergency changes in place and when each expires.
---

Read CLAUDE.md. Show temporary and emergency changes in place and when each expires.

Run `npm run moc -- temporary`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

A negative days_left means the change is past its approved time. Ask whether to extend (with a reason) or close it as reverted.

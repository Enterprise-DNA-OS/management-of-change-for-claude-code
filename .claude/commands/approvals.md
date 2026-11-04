---
description: Show changes waiting on a sign-off and which roles are missing.
---

Read CLAUDE.md. Show changes waiting on a sign-off and which roles are missing.

Run `npm run moc -- approvals`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Name the role missing on each and how long the change has waited. Sign-off rules live in the approval_rules table (run /rules).

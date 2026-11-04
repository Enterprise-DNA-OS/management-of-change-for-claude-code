---
description: Send a change for review with its risk level, technical basis and safety impact.
---

Read CLAUDE.md. Send a change for review with its risk level, technical basis and safety impact.

Run `npm run moc -- submit <change> --risk=low|medium|high --technical-basis= --safety-impact= [--procedures=yes|no] [--drawings=yes|no] [--safety-case=yes|no] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Ask whether it affects procedures, drawings or the safety case. Report which sign-offs it now needs.

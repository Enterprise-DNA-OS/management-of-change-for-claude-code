---
description: Raise a new change request.
---

Read CLAUDE.md. Raise a new change request.

Run `npm run moc -- raise --site= --title= --description= --type=equipment|process|chemical|procedure|control_system|organisational|facility --requested-by= --owner= [--class=permanent|temporary|emergency] [--expires=YYYY-MM-DD] [--emergency-reason=] [--area=] [--target=YYYY-MM-DD] [--code=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Ask for anything missing rather than inventing it. Temporary changes need an expiry; emergency changes need the reason and start in review.

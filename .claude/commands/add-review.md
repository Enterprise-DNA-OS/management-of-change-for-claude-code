---
description: Record a risk review (what-if, HAZOP, checklist, JSA, bowtie).
---

Read CLAUDE.md. Record a risk review (what-if, HAZOP, checklist, JSA, bowtie).

Run `npm run moc -- add-review <change> --method=checklist|what_if|hazop|jsa|bowtie|other --held-on=YYYY-MM-DD --leader= --findings= [--attendees=] [--before=] [--after=] --actor=`. Flags use `--name=value`; quote values with spaces. Add `--json` for structured results. Use the operator's actual values, drop optional brackets, and never run a literal placeholder.

Read the change first (`npm run moc -- change <code>`). Put the real person doing this in `--actor`. If a name is ambiguous, show the candidates and ask.

Medium and high risk changes cannot be signed off until one is recorded.

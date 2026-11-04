# Management of Change for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| What needs attention, what is overdue or expired | `/attention` |
| The change register, open changes | `/register`, `/open` |
| Who still has to sign off | `/approvals` |
| Temporary or emergency changes in place | `/temporary` |
| Open or overdue actions | `/actions`, `/overdue` |
| Safety case changes and regulator notices | `/safety-case` |
| How long changes take, by site | `/stats` |
| Who holds the most actions | `/workload` |
| Are we compliant | `/compliance` |
| Everything about one change | `/change` |
| Raise a change | `/raise` |
| Send it for review | `/submit` |
| Record a risk review | `/add-review` |
| Record a sign-off or rejection | `/approve` |
| Add or close an action | `/add-action`, `/complete-action` |
| Record a regulator notice | `/notify-regulator` |
| Record the pre-start-up safety review | `/pssr` |
| Put a change into operation | `/start-up` |
| Extend a temporary change | `/extend` |
| Close out, reject or cancel a change | `/close`, `/reject`, `/cancel` |
| Bring data across from Intelex | `/import` |
| A full snapshot | `/export` |
| A change record for the file | `/draft-moc-pack` |
| The Monday review | `/weekly-review` |
| Sites, people, sign-off rules, the log | `/sites`, `/people`, `/rules`, `/activity` |
| Change a field, a role or a rule | `/customise` |
| A new report | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run moc -- help`) and then propose a new command for it.

## Hard rules

- A change goes into operation only through `start-up`, which checks every gate. Never set a status by hand to get round a gate.
- Record only what happened: a sign-off a person gave, a review that was held, a notice that was sent. Never fill a gap to clear a finding.
- Sign-offs and the activity log are history. A wrong entry is corrected by a new entry and a note, never an overwrite.
- This system records regulator notices; it never sends one. Whether a change needs a notice is the operator's call, with docs/compliance.md as the reference.

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Intelex.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/intelex

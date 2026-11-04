<h1 align="center">Management of Change for Claude Code</h1>

<p align="center">
  <strong>The open-source management of change system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Intelex data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=intelex">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/intelex?utm_source=github&utm_medium=readme&utm_campaign=intelex">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-intelex">Instead of Intelex</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Management of Change for Claude Code does the job you pay Intelex for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Intelex dashboard cannot.

Intelex's entry Safety Essentials plan starts at US$44 per user a month with a 25-user minimum, billed annually, and Management of Change is not in it: it sits in the Advanced and Enterprise plans, which Intelex quotes privately ([intelex.com/request-price](https://www.intelex.com/request-price), checked 2026-11-04). Many sites end up paying for a whole safety suite to get one change control workflow.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=intelex).

It is change control for process plants: chemical blenders, food and drink factories, cool stores with ammonia refrigeration, water and wastewater plants, and any site where a new pump, a new chemical or a bypassed alarm can hurt someone. Every change is raised, given a risk level, technically justified, reviewed, signed off by the right roles, checked before start-up, and closed out with its procedures and drawings updated. Temporary changes carry an expiry, emergency repairs collect their sign-offs after the fact, and changes at major hazard facilities cannot start up until the regulator notice is recorded.

### Ten questions Intelex will not answer for you

These run against the demo data today. Ask them in plain words.

1. Which temporary changes have passed their expiry date and are still in place?
2. Which changes went into operation with training or procedure updates still open?
3. Which changes are waiting on a sign-off, and whose?
4. Which changes at a major hazard site affect the safety case and have not been notified?
5. Which emergency changes still lack their sign-offs a week after the repair?
6. Which operating procedures and drawings are still to be updated after a change?
7. How many days does a change take from request to start-up, by site and risk?
8. Who holds the most overdue change actions?
9. Which temporary changes have been extended more than once?
10. Which changes have been in operation for a month without being closed out?

### Your first hour: ten things to ask for

1. "What needs attention this week?" (`/attention`)
2. "Set up our sites: the Napier plant and the Hamilton depot. Napier is a lower tier major hazard facility."
3. "Our sign-offs are process engineer, production manager and H&S for medium risk; add the GM for high." (`/customise`)
4. "Bring across our Intelex change history" (`/import`, test run first)
5. "Raise a temporary change: bypass the low-level trip on tank 3 for ten days while the probe is replaced."
6. "What has to happen before MOC-0004 can start up?" (`/start-up` lists the blockers)
7. "Which temporary changes have we extended more than once?"
8. "Draft the change record for MOC-0006 for the shutdown file." (`/draft-moc-pack`)
9. "Put our logo and colours on the change records." (edit `brand.json`, then `npm run docs`)
10. "Write the Monday change review." (`/weekly-review`)

### Documents and views

- `npm run docs` renders the change record and the pre-start-up safety review certificate for every change, in your brand (`brand.json`), into `docs-out/`.
- `npm run view` renders the week, the temporary changes in place, and the change register as read-only HTML pages into `views/`.
- `/compliance` checks the records against the rules in [docs/compliance.md](docs/compliance.md), each with its source.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/management-of-change-for-claude-code.git
cd management-of-change-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`. On the demo data it finds an ammonia receiver bypass past its expiry, a control change running with operator training still open, and an emergency steam repair still waiting on two sign-offs.

Or from the terminal: `npm run moc -- attention`.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/attention` | What needs a person this week: expired bypasses, start-ups with training open, missing sign-offs, overdue actions. |
| `/register` | Every change with site, type, risk, status, sign-offs and open actions. |
| `/open` | Changes not yet closed, rejected or cancelled. |
| `/approvals` | Changes waiting on a sign-off, and which role is missing. |
| `/temporary` | Temporary and emergency changes in place, with days to expiry. |
| `/actions` | Every open change action. |
| `/overdue` | Overdue actions, and pre-start-up actions still open after start-up. |
| `/safety-case` | Major hazard site changes that affect the safety case, and whether the regulator was told. |
| `/stats` | Changes by site and risk, with days from request to start-up. |
| `/workload` | Open and overdue actions by person. |
| `/compliance` | The records checked against the rules in docs/compliance.md. |
| `/change` | One change: details, risk reviews, sign-offs, actions, history. |
| `/raise` | Raise a permanent, temporary or emergency change. |
| `/submit` | Send a change for review with its risk, technical basis and safety impact. |
| `/add-review` | Record a what-if, HAZOP, checklist, JSA or bowtie review. |
| `/approve` | Record one role's sign-off or rejection. Never overwritten. |
| `/add-action` | Add a before or after start-up action. |
| `/complete-action` | Close an action with its evidence. |
| `/notify-regulator` | Record the notice given to WorkSafe or your state regulator. |
| `/pssr` | Record the pre-start-up safety review (refused while anything is open). |
| `/start-up` | Put a change into operation, after every gate passes. |
| `/extend` | Extend a temporary change, with a reason. |
| `/close` | Close out a change; temporary ones record reverted or made permanent. |
| `/reject`, `/cancel` | End a change that never went into operation. |
| `/import` | Bring change and action history across from an Intelex export. |
| `/export` | A complete private snapshot of every table. |
| `/draft-moc-pack` | The change record for one change, drafted to drafts/. |
| `/weekly-review` | The Monday change review, written from attention, approvals and temporary. |
| `/sites`, `/people`, `/rules`, `/activity` | Reference lists and the append-only log. |
| `/customise` | Add a field, rename a role, change a sign-off rule, in plain language. |
| `/new-view` | Add a read-only report in your brand. |

## Instead of Intelex

Export your Management of Change report view and its actions from Intelex as CSV, set up your sites, run `npm run moc -- import intelex --changes=moc.csv --actions=moc-actions.csv --dry-run --actor="Your Name"`, check the counts, then run it for real. Column names vary by configuration, so the importer reports what it cannot map and never guesses. Sign-offs, risk review worksheets and attachments do not come across in a CSV. Full guide: [docs/replace-intelex.md](docs/replace-intelex.md).

## Architecture

```
management-of-change-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Management of Change for Claude Code for your business, migrates your Intelex data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=intelex)
- Read more: [enterprisedna.co/omni/instead-of/intelex](https://enterprisedna.co/omni/instead-of/intelex?utm_source=github&utm_medium=readme&utm_campaign=intelex)

## License

MIT. Copyright (c) 2026 Enterprise DNA.

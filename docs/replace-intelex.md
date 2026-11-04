# Moving off Intelex

Intelex Management of Change records live in forms your administrator configured, so every site's export looks a little different. This guide gets your change history out, checks it, and brings it in without guessing.

## 1. Export from Intelex

1. In Intelex, open the Management of Change application and build (or open) a report view that lists one row per change request.
2. Add the columns you have: record number, title, description, site or location, change type, classification (permanent or temporary), risk level, status or workflow stage, requested by, owner, date raised, target date, expiry date, technical basis, safety impact, start-up date and closed date.
3. Export the view to CSV (from Excel, save as CSV UTF-8). Do the same for the actions or tasks linked to each change, with the parent record number on every row.

Keep both files out of the repository folder or under `imports/` (ignored by git). They hold names and plant details.

## 2. Set up your sites

Every change belongs to a site. Add your sites to the `sites` table first (ask Claude Code: "add our Napier plant as site NPR, New Zealand, not a major hazard facility"). The importer matches the export's site column to a site code or name, or uses `--site=CODE` when the export has no site column.

## 3. Test run

```bash
npm run moc -- import intelex --changes=imports/moc.csv --actions=imports/moc-actions.csv --dry-run --actor="Your Name"
```

The test run reports how many changes are new, how many are already here, how many actions it read, and every row it cannot map. It writes nothing.

## 4. Import

Run the same command without `--dry-run`. The whole file goes in one transaction or not at all. Running it again adds nothing new. Every import is logged with the file's fingerprint.

## What maps

| This build | Columns accepted (first match wins) |
|---|---|
| code | Record Number, Record No, MOC Number, MOC No, Change Number, ID |
| title | Title, Change Title, Subject, Short Description |
| description | Description, Change Description, Details |
| site | Site, Location, Facility |
| change_type | Change Type, Type, Category (words like mechanical, piping, control, software, chemical, procedure, building) |
| classification | Change Class, Classification, Duration, Permanent/Temporary |
| risk_level | Risk Level, Risk Rating, Risk (low, medium, high; minor, moderate, major, extreme) |
| status | Status, Workflow Stage, Stage (draft, under review, approved, implemented, closed, rejected, cancelled) |
| requested_by, owner | Requested By, Requestor, Initiator; Change Owner, Owner, Responsible Person, Assigned To |
| dates | Date Raised, Target Date, Expiry Date, Start-up Date, Closed Date (YYYY-MM-DD or DD/MM/YYYY) |
| technical_basis, safety_impact | Technical Basis, Justification, Reason for Change; Safety Impact, Impact on Safety and Health, Risk Assessment Summary |
| actions | Record Number, Action Number, Action Description, Assigned To, Due Date, Completed Date, Completion Notes, Pre/Post Startup, Action Type |

If your columns have other names, rename the header in the CSV, or ask Claude Code to add the name to the importer (`/customise`).

## What does not carry over

- Sign-offs, risk review worksheets and attachments. Intelex stores these as workflow steps and linked documents. Imported changes arrive with no sign-offs, so `/compliance` will list changes in operation without them. Record the ones that matter with `approve` and `add-review`, citing the Intelex record, or accept the finding for closed history.
- Pre-start-up safety reviews. Record them with `pssr` for changes still in operation.
- Regulator notices. Record them with `notify-regulator`.
- Attachments (P&IDs, HAZOP reports). Keep them in your document system and put the document number in the action evidence.

Enterprise DNA maps a customised Intelex export, sign-offs and attachments included, as part of the paid setup: https://enterprisedna.co/omni/instead-of/intelex

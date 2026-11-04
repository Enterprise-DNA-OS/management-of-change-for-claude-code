# Import fixtures

Synthetic example files in the shape of an Intelex Management of Change report export: one row per change, and one row per action. They exist so `npm test` can prove the import end to end.

Intelex forms are configured per customer, so your export may use different column names. The importer accepts the names listed in `docs/replace-intelex.md` and tells you exactly which column it could not find. It never guesses.

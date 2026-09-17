-- companies.source was locked to ('google_maps','manual','referral','other') via CHECK.
-- Matches the same tradeoff already made for signal_type/pain_type elsewhere in this
-- schema: validated at the app layer instead of a DB CHECK, so a new source ("import",
-- "csv", a named campaign, etc.) doesn't need a migration every time one shows up.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_source_check;
ALTER TABLE companies ALTER COLUMN source TYPE VARCHAR(60);

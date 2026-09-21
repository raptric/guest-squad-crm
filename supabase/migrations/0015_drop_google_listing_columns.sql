-- The Google Maps link and listing id are not needed in the CRM. Discard them, and the extra
-- scrape data (scrape time, map coordinates, listing links) stored on the Bahrain seed rows.
-- The general company email column (0014) is kept.
UPDATE companies SET custom_fields = '{}'::jsonb WHERE custom_fields->>'import_batch' = 'bahrain-seed';

DROP INDEX IF EXISTS idx_companies_google_cid;
ALTER TABLE companies DROP COLUMN IF EXISTS google_maps_url;
ALTER TABLE companies DROP COLUMN IF EXISTS google_cid;

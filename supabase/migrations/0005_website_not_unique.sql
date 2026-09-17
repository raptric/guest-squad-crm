-- idx_companies_website assumed every company has a distinct website. That's false for
-- chain-affiliated properties: gscraper often can't find a property-specific site and
-- reports the brand's generic corporate domain (e.g. "hilton.com") for many genuinely
-- different physical hotels. The unique constraint made those inserts fail outright once
-- the ingest API's dedup logic was fixed to require name+domain together instead of domain
-- alone. Dedup now lives entirely at the application layer (matching.ts), same tradeoff
-- already made for source/signal_type/pain_type elsewhere in this schema.
DROP INDEX IF EXISTS idx_companies_website;
CREATE INDEX idx_companies_website ON companies(website) WHERE deleted_at IS NULL;

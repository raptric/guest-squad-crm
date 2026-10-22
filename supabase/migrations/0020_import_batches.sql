-- One row per scraping campaign, so we know where a batch of companies came from. The scraper
-- sends the campaign details with its inserts; the first request with a given campaign_id
-- creates the batch, later ones attach to it. Record counts are derived from companies, not stored.
CREATE TABLE import_batches (
    id             BIGSERIAL PRIMARY KEY,
    campaign_id    VARCHAR(100) NOT NULL UNIQUE,
    campaign_name  VARCHAR(255) NOT NULL,
    country        VARCHAR(100),
    state          VARCHAR(100),
    city           VARCHAR(100),
    notes          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE companies
    ADD COLUMN import_batch_id BIGINT REFERENCES import_batches(id) ON DELETE SET NULL;

CREATE INDEX idx_companies_import_batch_id ON companies(import_batch_id);

-- Explicit grants (Supabase stops auto-granting Data API access on new public tables from 2026-10-30).
GRANT SELECT ON import_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON import_batches TO service_role;
GRANT USAGE, SELECT ON SEQUENCE import_batches_id_seq TO service_role;

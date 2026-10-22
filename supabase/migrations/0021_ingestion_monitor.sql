-- Scraper ingestion monitoring: batch status/origin + a log of every push to the import API.

-- 'scraper' = created by a real campaign push; 'backfill' = grouped after the fact (legacy data).
-- status is set by an admin after checking the batch by hand; staleness (no push for 24h) is derived.
ALTER TABLE import_batches
    ADD COLUMN origin       VARCHAR(20) NOT NULL DEFAULT 'scraper' CHECK (origin IN ('scraper','backfill')),
    ADD COLUMN status       VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
    ADD COLUMN completed_at TIMESTAMPTZ,
    ADD COLUMN completed_by BIGINT REFERENCES users(id) ON DELETE SET NULL;

-- Batches created by the backfills are historical: closed by definition.
UPDATE import_batches
   SET origin = 'backfill', status = 'completed', completed_at = now()
 WHERE campaign_id LIKE 'legacy-%';

-- One row per call to the import API, including rejected ones, so failures are visible.
CREATE TABLE import_push_log (
    id           BIGSERIAL PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id     BIGINT REFERENCES import_batches(id) ON DELETE SET NULL,
    campaign_id  VARCHAR(100),
    status_code  INTEGER NOT NULL,
    outcome      VARCHAR(20) NOT NULL CHECK (outcome IN ('ok','partial','failed','unauthorized')),
    received     INTEGER NOT NULL DEFAULT 0,
    created      INTEGER NOT NULL DEFAULT 0,
    skipped      INTEGER NOT NULL DEFAULT 0,
    error        TEXT,
    skipped_detail JSONB,
    duration_ms  INTEGER
);

CREATE INDEX idx_import_push_log_created_at ON import_push_log (created_at DESC);
CREATE INDEX idx_import_push_log_batch_id ON import_push_log (batch_id);

GRANT SELECT ON import_push_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON import_push_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE import_push_log_id_seq TO service_role;

-- Duplicates page (phase 1): scan the CRM for copies of the same company, let a person keep one and delete the rest.
-- Deletes are soft (companies.deleted_at) so they can be undone. These two tables only record what people decided.

-- "These are not duplicates": the group is hidden until a new copy joins it (the member list is compared as a set).
CREATE TABLE duplicate_dismissals (
    id                 BIGSERIAL PRIMARY KEY,
    company_ids        BIGINT[] NOT NULL,
    dismissed_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    dismissed_by_name  VARCHAR(255),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per "keep this one, delete the others", so it can be undone later.
CREATE TABLE duplicate_deletions (
    id                    BIGSERIAL PRIMARY KEY,
    kept_company_id       BIGINT REFERENCES companies(id) ON DELETE SET NULL,
    deleted_company_ids   BIGINT[] NOT NULL,
    deleted_by            BIGINT REFERENCES users(id) ON DELETE SET NULL,
    deleted_by_name       VARCHAR(255),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    undone_at             TIMESTAMPTZ,
    undone_by_name        VARCHAR(255)
);
CREATE INDEX idx_duplicate_deletions_open ON duplicate_deletions (created_at DESC) WHERE undone_at IS NULL;

GRANT SELECT ON duplicate_dismissals, duplicate_deletions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON duplicate_dismissals, duplicate_deletions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE duplicate_dismissals_id_seq, duplicate_deletions_id_seq TO service_role;

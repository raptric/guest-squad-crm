-- Phase 1 (read-only) of the Codex research contract: get_company must return relationship
-- facts and research metadata as real fields, not fabricated nulls, so Phase 2 writeback has
-- somewhere real to write. Free text (not FKs) because a researched entity -- e.g. a management
-- company found during research -- may not exist as its own Company record yet.
ALTER TABLE companies
    ADD COLUMN brand_name               VARCHAR(255),
    ADD COLUMN ownership_entity          VARCHAR(255),
    ADD COLUMN operating_entity           VARCHAR(255),
    ADD COLUMN management_entity            VARCHAR(255),
    -- Which relationship (ownership/operating/management, or the linked parent_company_id) is
    -- treated as the primary one for this property, and why -- free text since the research
    -- engine's classification vocabulary isn't finalized yet.
    ADD COLUMN primary_operating_parent      VARCHAR(255),
    ADD COLUMN primary_parent_reason          TEXT,

    ADD COLUMN identity_status                 VARCHAR(60),
    ADD COLUMN identity_confidence              VARCHAR(30),
    ADD COLUMN identity_notes                    TEXT,
    ADD COLUMN research_complete                  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN needs_human_review                  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN confidence_notes                     TEXT,
    ADD COLUMN last_researched                       TIMESTAMPTZ;

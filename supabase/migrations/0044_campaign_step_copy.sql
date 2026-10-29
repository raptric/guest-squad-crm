-- Campaign steps can carry a baseline email: a subject and a body written once for the campaign (by hand or with AI), which is
-- later adapted for each company. copy_source says how it was written: 'ai' (as the AI wrote it), 'edited' (AI, then changed by a
-- person) or 'human'. copy_by / copy_at say who saved that text and when. Only Initial Email and Follow-up Email steps use these.
ALTER TABLE campaign_steps
    ADD COLUMN subject     VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN body        TEXT NOT NULL DEFAULT '',
    ADD COLUMN copy_source VARCHAR(10) CHECK (copy_source IN ('ai', 'edited', 'human')),
    ADD COLUMN copy_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN copy_at     TIMESTAMPTZ;

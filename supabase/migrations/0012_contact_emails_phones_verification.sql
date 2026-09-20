-- Contacts: multiple emails/phones, per-company job details, and verification + provenance
-- for human-in-the-loop review of agent (Codex) research.
--
-- Verification model: is_verified is a HUMAN confirmation. Agent-written rows always start
-- unverified and carry the source_url/evidence the agent found, added_by_type = 'agent'.

INSERT INTO picklist_values (field_name, value, sort_order) VALUES
  ('email_label', 'Work', 10), ('email_label', 'Personal', 20), ('email_label', 'Other', 30),
  ('phone_label', 'Work', 10), ('phone_label', 'Cell', 20), ('phone_label', 'Home', 30),
  ('phone_label', 'Front Desk', 40), ('phone_label', 'Other', 50)
ON CONFLICT DO NOTHING;

-- 1. Per-company details + verification on the join table.
ALTER TABLE contact_companies
    ADD COLUMN job_title            VARCHAR(120),
    ADD COLUMN contact_role         VARCHAR(40),
    ADD COLUMN decision_maker_level VARCHAR(30),
    ADD COLUMN is_verified          BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN verified_at          TIMESTAMPTZ,
    ADD COLUMN verified_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN source_url           TEXT,
    ADD COLUMN evidence             TEXT,
    ADD COLUMN added_by_type        VARCHAR(10) NOT NULL DEFAULT 'human' CHECK (added_by_type IN ('human','agent')),
    ADD COLUMN added_by_name        VARCHAR(120);

-- 2. Emails. company_id (optional) ties a work email to one company; NULL = general/personal.
CREATE TABLE contact_emails (
    id               BIGSERIAL PRIMARY KEY,
    contact_id       BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    email            VARCHAR(255) NOT NULL,
    label            VARCHAR(30),
    company_id       BIGINT REFERENCES companies(id) ON DELETE SET NULL,
    is_primary       BOOLEAN NOT NULL DEFAULT false,
    is_verified      BOOLEAN NOT NULL DEFAULT false,
    verified_at      TIMESTAMPTZ,
    verified_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
    source_url       TEXT,
    evidence         TEXT,
    added_by_type    VARCHAR(10) NOT NULL DEFAULT 'human' CHECK (added_by_type IN ('human','agent')),
    added_by_name    VARCHAR(120),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_contact_emails_email ON contact_emails (lower(email));
CREATE UNIQUE INDEX idx_contact_emails_one_primary ON contact_emails (contact_id) WHERE is_primary;
CREATE INDEX idx_contact_emails_contact_id ON contact_emails (contact_id);
CREATE INDEX idx_contact_emails_company_id ON contact_emails (company_id);

-- 3. Phones (same shape).
CREATE TABLE contact_phones (
    id               BIGSERIAL PRIMARY KEY,
    contact_id       BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    phone            VARCHAR(50) NOT NULL,
    label            VARCHAR(30),
    company_id       BIGINT REFERENCES companies(id) ON DELETE SET NULL,
    is_primary       BOOLEAN NOT NULL DEFAULT false,
    is_verified      BOOLEAN NOT NULL DEFAULT false,
    verified_at      TIMESTAMPTZ,
    verified_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
    source_url       TEXT,
    evidence         TEXT,
    added_by_type    VARCHAR(10) NOT NULL DEFAULT 'human' CHECK (added_by_type IN ('human','agent')),
    added_by_name    VARCHAR(120),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_contact_phones_one_primary ON contact_phones (contact_id) WHERE is_primary;
CREATE INDEX idx_contact_phones_contact_id ON contact_phones (contact_id);
CREATE INDEX idx_contact_phones_company_id ON contact_phones (company_id);

-- 4. Backfill from the legacy single-value columns on contacts (kept for one deploy).
UPDATE contact_companies cc
   SET job_title = c.job_title, contact_role = c.contact_role, decision_maker_level = c.decision_maker_level
  FROM contacts c WHERE cc.contact_id = c.id;

INSERT INTO contact_emails (contact_id, email, label, company_id, is_primary)
SELECT c.id, lower(trim(c.email)), 'Work',
       (SELECT company_id FROM contact_companies WHERE contact_id = c.id AND is_primary), true
  FROM contacts c WHERE c.email IS NOT NULL AND c.deleted_at IS NULL;

INSERT INTO contact_phones (contact_id, phone, label, company_id, is_primary)
SELECT c.id, c.phone, 'Work',
       (SELECT company_id FROM contact_companies WHERE contact_id = c.id AND is_primary), true
  FROM contacts c WHERE c.phone IS NOT NULL AND c.phone <> '' AND c.deleted_at IS NULL;

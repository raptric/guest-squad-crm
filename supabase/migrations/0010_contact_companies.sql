-- Contacts can belong to several companies (e.g. a regional GM covering many hotels, or a
-- portfolio owner tied to the group and each property). contact_companies is the source of
-- truth; exactly one association per contact is flagged primary (shown first in the UI).
CREATE TABLE contact_companies (
    contact_id  BIGINT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    is_primary  BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (contact_id, company_id)
);

CREATE INDEX idx_contact_companies_company_id ON contact_companies(company_id);
CREATE UNIQUE INDEX idx_contact_companies_one_primary ON contact_companies(contact_id) WHERE is_primary;

INSERT INTO contact_companies (contact_id, company_id, is_primary)
SELECT id, company_id, true FROM contacts WHERE company_id IS NOT NULL;

-- Legacy single-company column: no longer written by the app. Kept nullable for one deploy
-- so the previous release keeps working; dropped in a follow-up migration.
ALTER TABLE contacts ALTER COLUMN company_id DROP NOT NULL;

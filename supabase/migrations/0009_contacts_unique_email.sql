-- Contacts are deduplicated by email (the research agent only creates contacts with a
-- verified email). Normalize casing first, then enforce uniqueness among live contacts.
UPDATE contacts SET email = lower(trim(email)) WHERE email IS NOT NULL;
UPDATE contacts SET email = NULL WHERE email = '';

CREATE UNIQUE INDEX idx_contacts_email_unique ON contacts (email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

-- contact_companies (0010) is the source of truth for contact/company links.
-- Drop the legacy single-company column (its FK and index go with it).
ALTER TABLE contacts DROP COLUMN company_id;

-- Companies page upgrade (phase 2).
-- team_id: the team a company is assigned to (admins assign to a team, team leads then assign to users via
-- owner_id). Schema only for now -- assignment itself comes in phase 3, so every value is NULL until then.
ALTER TABLE companies
    ADD COLUMN team_id BIGINT REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX idx_companies_team_id ON companies (team_id);
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON companies (owner_id);
CREATE INDEX IF NOT EXISTS idx_companies_country ON companies (country);
CREATE INDEX IF NOT EXISTS idx_companies_state ON companies (state);
CREATE INDEX IF NOT EXISTS idx_companies_prospect_tier ON companies (prospect_tier);
CREATE INDEX IF NOT EXISTS idx_companies_created_at ON companies (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_companies_parent_company_id ON companies (parent_company_id);

-- Fast "contains" search on name and city (ILIKE '%text%') as the table grows.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX idx_companies_name_trgm ON companies USING gin (name extensions.gin_trgm_ops);
CREATE INDEX idx_companies_city_trgm ON companies USING gin (city extensions.gin_trgm_ops);

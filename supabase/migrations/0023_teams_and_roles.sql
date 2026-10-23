-- Teams and the Team Lead role (phase 1: structure only -- nothing about visibility or assignment yet).
--   * a person belongs to at most one team (admins to none)
--   * a team has at most one lead (for now)
--   * a team lead must belong to a team
CREATE TABLE teams (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ux_teams_name ON teams (lower(name));

-- RESTRICT: a team that still has members can't be deleted.
ALTER TABLE users
    ADD COLUMN team_id BIGINT REFERENCES teams(id) ON DELETE RESTRICT;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'team_lead', 'user'));
ALTER TABLE users ADD CONSTRAINT users_lead_has_team CHECK (role <> 'team_lead' OR team_id IS NOT NULL);
ALTER TABLE users ADD CONSTRAINT users_admin_has_no_team CHECK (role <> 'super_admin' OR team_id IS NULL);

CREATE UNIQUE INDEX ux_users_one_lead_per_team ON users (team_id) WHERE role = 'team_lead';
CREATE INDEX idx_users_team_id ON users (team_id);

GRANT SELECT ON teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON teams TO service_role;
GRANT USAGE, SELECT ON SEQUENCE teams_id_seq TO service_role;

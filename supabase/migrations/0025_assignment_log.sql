-- Bulk assignment audit trail (phase 3). One row per assign/unassign action, plus the previous owner and
-- team of every company it changed, so a past action can be reviewed -- or undone later.
CREATE TABLE assignment_log (
    id               BIGSERIAL PRIMARY KEY,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    actor_name       VARCHAR(255) NOT NULL,
    action           VARCHAR(20) NOT NULL CHECK (action IN ('team', 'user', 'remove_owner', 'remove_team')),
    target_id        BIGINT,
    target_name      VARCHAR(255),
    mode             VARCHAR(20) NOT NULL CHECK (mode IN ('skip_assigned', 'reassign')),
    selection_kind   VARCHAR(10) NOT NULL CHECK (selection_kind IN ('ids', 'filters')),
    filters          TEXT,
    selected_count   INTEGER NOT NULL,
    changed_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_assignment_log_created_at ON assignment_log (created_at DESC);

CREATE TABLE assignment_log_items (
    id             BIGSERIAL PRIMARY KEY,
    log_id         BIGINT NOT NULL REFERENCES assignment_log(id) ON DELETE CASCADE,
    company_id     BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    prev_owner_id  BIGINT,
    prev_team_id   BIGINT
);

CREATE INDEX idx_assignment_log_items_log_id ON assignment_log_items (log_id);
CREATE INDEX idx_assignment_log_items_company_id ON assignment_log_items (company_id);

GRANT SELECT ON assignment_log, assignment_log_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_log, assignment_log_items TO service_role;
GRANT USAGE, SELECT ON SEQUENCE assignment_log_id_seq, assignment_log_items_id_seq TO service_role;

-- The emails people actually send for campaign tasks, kept in the CRM so a follow-up knows what was already said (and, later, so
-- Gmail can attach its message and thread ids and replies can be linked). One row per message.
--   source: where the text came from -- 'baseline' (the campaign's baseline, filled in and not changed), 'ai' (written for this
--           company with AI and not changed), 'edited' (started from either, then changed by hand) or 'human' (written or pasted).
--   status: 'sent' is what the person confirmed they sent; 'void' is a sent record that was undone (the task was reopened);
--           'draft' is reserved for AI drafts saved on a task.
--   direction: 'out' for what we sent. 'in' is reserved for replies.
-- Like the AI tables, this one is read and written only by the CRM server; nothing is granted to the public API roles.
CREATE TABLE campaign_messages (
    id               BIGSERIAL PRIMARY KEY,
    task_id          BIGINT REFERENCES campaign_tasks(id) ON DELETE SET NULL,
    enrollment_id    BIGINT REFERENCES campaign_enrollments(id) ON DELETE SET NULL,
    campaign_id      BIGINT REFERENCES campaigns(id) ON DELETE SET NULL,
    company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contact_id       BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
    step_position    INTEGER,
    step_day         INTEGER,
    channel          VARCHAR(30) NOT NULL,
    direction        VARCHAR(3) NOT NULL DEFAULT 'out' CHECK (direction IN ('out', 'in')),
    subject          VARCHAR(300) NOT NULL DEFAULT '',
    body             TEXT NOT NULL,
    source           VARCHAR(10) NOT NULL CHECK (source IN ('baseline', 'ai', 'edited', 'human')),
    status           VARCHAR(10) NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'void')),
    sent_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
    sent_at          TIMESTAMPTZ,
    gmail_message_id VARCHAR(200),
    gmail_thread_id  VARCHAR(200),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_campaign_messages_company ON campaign_messages (company_id, campaign_id, sent_at);
CREATE INDEX ix_campaign_messages_task ON campaign_messages (task_id, status);

REVOKE ALL ON campaign_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE campaign_messages_id_seq FROM PUBLIC, anon, authenticated;
ALTER TABLE campaign_messages ENABLE ROW LEVEL SECURITY;

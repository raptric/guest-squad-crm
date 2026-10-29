-- Emails the AI wrote for one company are kept as drafts on the task, so reopening the task costs no new AI call and so what the AI
-- wrote can be compared with what was finally sent. facts_used lists the facts from the company the AI said it relied on; notes is
-- anything it told the person (for example that nothing relevant was found). A draft is replaced (status 'void') when new ones are
-- written, and when the task is marked done.
ALTER TABLE campaign_messages
    ADD COLUMN facts_used  JSONB,
    ADD COLUMN notes       VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN model       VARCHAR(100),
    ADD COLUMN created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL;

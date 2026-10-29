-- Settings -> AI -> Writing rules becomes one text box (data = {"text": "..."}), and the step types follow the campaign
-- Channel dropdown: Initial Email, Follow-up Email, Call, LinkedIn connection, LinkedIn message.

-- Versions per click and creativity were part of the old rules. They are generation settings, so they move here.
ALTER TABLE ai_settings
    ADD COLUMN variants   SMALLINT    NOT NULL DEFAULT 2 CHECK (variants BETWEEN 1 AND 3),
    ADD COLUMN creativity VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (creativity IN ('low', 'medium', 'high'));

UPDATE ai_settings s
   SET variants   = coalesce(nullif((r.data->'defaults'->>'variants')::int, 0), 2),
       creativity = coalesce(nullif(r.data->'defaults'->>'creativity', ''), 'medium')
  FROM ai_rules r
 WHERE r.id = 1 AND r.data ? 'defaults' AND (r.data->'defaults'->>'variants')::int BETWEEN 1 AND 3 AND r.data->'defaults'->>'creativity' IN ('low', 'medium', 'high');

-- Rules nobody has edited are replaced by the starting text. Rules someone did edit stay as they are and are converted to
-- text when the page opens.
WITH starting AS (
    SELECT $text$VOICE
Direct, calm, practical, hospitality-aware. We sound like someone who has worked a front desk. Not salesy, pushy, corporate, hyped or flattering. Peer to peer. Short sentences, one idea each, plain words (grade 6 to 8). No exclamation marks.

STRUCTURE
- Open with something real about them or the campaign's pain. Never open with who we are. If there is nothing real, do not pretend to know them.
- One pain and one idea per email. Use proof only if it is in the knowledge. Never invent numbers, names or reviews.
- Exactly one ask, as a low-pressure question.
- Plain text. No links or attachments in the first email.
- Sign off with the sender's own name only.

NEVER WRITE
"I hope this finds you well", "touching base", "circling back", "just following up", "synergy", "game-changer", "revolutionary", "best-in-class", "cutting-edge", "leverage", "I wanted to reach out", "as per my last email".
Avoid spam-trigger words: free, guarantee, act now, limited time, risk-free, 100%, winner, urgent, click here.$text$ AS body
), upd AS (
    UPDATE ai_rules SET data = jsonb_build_object('text', (SELECT body FROM starting)), updated_at = now()
     WHERE id = 1 AND updated_by IS NULL
    RETURNING data
)
INSERT INTO ai_versions (kind, ref, snapshot, changed_by)
SELECT 'rules', 'rules', jsonb_build_object('data', data), NULL FROM upd;

-- Example step types.
ALTER TABLE ai_examples DROP CONSTRAINT ai_examples_role_check;
UPDATE ai_examples SET role = CASE role
    WHEN 'opener' THEN 'initial_email'
    WHEN 'followup' THEN 'followup_email'
    WHEN 'value_add' THEN 'followup_email'
    WHEN 'breakup' THEN 'followup_email'
    WHEN 'call_script' THEN 'call'
    ELSE role END;
ALTER TABLE ai_examples ADD CONSTRAINT ai_examples_role_check
    CHECK (role IN ('initial_email', 'followup_email', 'call', 'linkedin_connect', 'linkedin_message'));

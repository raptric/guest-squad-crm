-- Campaign steps: the "Email" channel becomes two, "Initial Email" and "Follow-up Email", so a step says which kind of email it is.
-- Existing Email steps are converted: in each campaign the first Email step is the Initial Email and the later ones are Follow-up Emails.
-- Tasks keep a copy of their step's channel, so they are converted the same way (per enrollment).

ALTER TABLE campaign_steps DROP CONSTRAINT campaign_steps_channel_check;

UPDATE campaign_steps s
   SET channel = CASE WHEN s.position = (SELECT min(x.position) FROM campaign_steps x WHERE x.campaign_id = s.campaign_id AND x.channel = 'Email')
                      THEN 'Initial Email' ELSE 'Follow-up Email' END
 WHERE s.channel = 'Email';

UPDATE campaign_tasks t
   SET step_channel = CASE WHEN t.step_position = (SELECT min(x.step_position) FROM campaign_tasks x WHERE x.enrollment_id = t.enrollment_id AND x.step_channel = 'Email')
                           THEN 'Initial Email' ELSE 'Follow-up Email' END
 WHERE t.step_channel = 'Email';

ALTER TABLE campaign_steps ADD CONSTRAINT campaign_steps_channel_check
    CHECK (channel IN ('Initial Email', 'Follow-up Email', 'Call', 'LinkedIn connection', 'LinkedIn message', 'WhatsApp / SMS', 'Other'));

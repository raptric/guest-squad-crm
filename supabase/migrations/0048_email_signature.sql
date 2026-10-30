-- Each person's email signature, added to every email they send from the CRM so all their emails end the same way. It is written on
-- the Profile. campaign_messages.signature keeps the signature that went out with a sent email, so the history still shows exactly
-- what the recipient got after the person changes their signature.
ALTER TABLE users ADD COLUMN email_signature TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_messages ADD COLUMN signature TEXT NOT NULL DEFAULT '';

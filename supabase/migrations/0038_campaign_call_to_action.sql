-- Messaging: the call to action, what the person asks the hotel for at the end of every message
-- (e.g. "Book a 15-minute call this week"). Optional.
ALTER TABLE campaigns ADD COLUMN call_to_action VARCHAR(200) NOT NULL DEFAULT '';

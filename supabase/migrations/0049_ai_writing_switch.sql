-- A master switch for AI writing (Settings -> AI). When it is off, the Generate with AI and Write for this company buttons are hidden and
-- the server refuses AI writing requests. It starts OFF.
ALTER TABLE ai_settings ADD COLUMN writing_enabled BOOLEAN NOT NULL DEFAULT false;

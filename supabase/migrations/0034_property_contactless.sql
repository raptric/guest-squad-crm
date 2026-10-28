-- Contactless flag on the property profile. Nullable on purpose: checked = true, unchecked = not recorded
-- (not a confirmed "no"), so the existing properties aren't all marked as "not contactless".
ALTER TABLE property_details ADD COLUMN contactless BOOLEAN;

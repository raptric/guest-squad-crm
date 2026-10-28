-- Free text for "Other": when "Other" is picked among the other pain points or the key differentiators, the person
-- writes what it is. (The objections table stays, unused for now; the form and Playbook no longer show objections.)
ALTER TABLE campaigns
    ADD COLUMN secondary_other       VARCHAR(200) NOT NULL DEFAULT '',
    ADD COLUMN differentiators_other VARCHAR(200) NOT NULL DEFAULT '';

INSERT INTO picklist_values (field_name, value, sort_order) VALUES ('key_differentiator', 'Other', 4)
ON CONFLICT (field_name, value) DO NOTHING;

-- gscraper rule (Settings -> Rules): which status / stage companies created by the scraper start at, and an optional
-- default property type for scraped records that don't send a (valid) one. Reuses pipeline_rules: one new row plus one
-- nullable column that only this rule uses.

ALTER TABLE pipeline_rules ADD COLUMN property_type TEXT;

INSERT INTO pipeline_rules (rule_key, status_id, stage_id)
SELECT 'on_scraped', s.id, g.id
  FROM pipeline_statuses s
  JOIN pipeline_stages g ON g.status_id = s.id
 WHERE s.name = 'New' AND g.name = 'Not researched';

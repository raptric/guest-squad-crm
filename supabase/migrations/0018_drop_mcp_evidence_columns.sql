-- Reverts the evidence/confidence columns added in 0017 to 8 existing tables. That data lives
-- in mcp_audit_log instead (it already stores the full canonical_result and computed response
-- as JSON per mutation) rather than being spread as extra columns across every domain table.
-- mcp_audit_log itself is unchanged. Columns that predate 0017 (source_url, evidence,
-- added_by_type/name, is_verified, rationale, etc.) are untouched.

ALTER TABLE company_ratings
    DROP COLUMN native_scale,
    DROP COLUMN listing_url,
    DROP COLUMN source_url,
    DROP COLUMN notes,
    DROP COLUMN confidence;

ALTER TABLE property_pain_signals
    DROP COLUMN evidence,
    DROP COLUMN confidence;

ALTER TABLE company_hiring_signals
    DROP COLUMN notes,
    DROP COLUMN confidence;

ALTER TABLE company_signals
    DROP COLUMN notes,
    DROP COLUMN confidence;

-- Also drops human-vs-research_auto Offer overwrite protection: apply_research_result and
-- set_offers may now freely overwrite any existing Primary/Secondary Offer regardless of who
-- set it (explicit decision -- see session log).
ALTER TABLE offer_recommendations
    DROP COLUMN source,
    DROP COLUMN mapping_version;

ALTER TABLE contact_companies DROP COLUMN confidence;
ALTER TABLE contact_emails DROP COLUMN confidence;
ALTER TABLE contact_phones DROP COLUMN confidence;

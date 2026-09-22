-- Phase 2 (writeback) support: an audit/idempotency ledger for MCP mutations, evidence columns
-- on ratings/pain/hiring/sales signals (native scale, notes, confidence -- research must never
-- convert a rating scale or drop the evidence behind a value), and provenance on offers so a
-- human-selected Primary/Secondary Offer is never silently overwritten by auto-mapping.

-- One row per attempted mutation from apply_research_result / set_offers. idempotency_key is
-- unique when present: a second call with the same key finds this row and replays its stored
-- response instead of re-doing the work (status stays 'applied' after a full success; a
-- 'failed' row can be retried with the same key since a failed transaction wrote nothing).
CREATE TABLE mcp_audit_log (
    id                BIGSERIAL PRIMARY KEY,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    tool_name           VARCHAR(60) NOT NULL,
    actor_name           VARCHAR(120) NOT NULL,
    company_id            BIGINT REFERENCES companies(id) ON DELETE SET NULL,
    idempotency_key         VARCHAR(255),
    -- in_progress is a transient reservation state: it exists only between reserving an
    -- idempotency key and the transaction that finalizes it committing or rolling back.
    status                    VARCHAR(20) NOT NULL
        CHECK (status IN ('in_progress','applied','already_applied','needs_review','failed')),
    request                     JSONB,
    response                     JSONB,
    warnings                      JSONB NOT NULL DEFAULT '[]'
);

CREATE UNIQUE INDEX idx_mcp_audit_log_idempotency_key ON mcp_audit_log (idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_mcp_audit_log_company_id ON mcp_audit_log (company_id);
CREATE INDEX idx_mcp_audit_log_tool_name ON mcp_audit_log (tool_name);

-- Reputation: never convert a rating scale between platforms -- keep the native scale, the
-- listing it came from, and enough evidence/confidence to judge it later.
ALTER TABLE company_ratings
    ADD COLUMN native_scale  VARCHAR(20),
    ADD COLUMN listing_url    TEXT,
    ADD COLUMN source_url      TEXT,
    ADD COLUMN notes            TEXT,
    ADD COLUMN confidence        VARCHAR(20);

ALTER TABLE property_pain_signals
    ADD COLUMN evidence    TEXT,
    ADD COLUMN confidence   VARCHAR(20);

ALTER TABLE company_hiring_signals
    ADD COLUMN notes       TEXT,
    ADD COLUMN confidence   VARCHAR(20);

ALTER TABLE company_signals
    ADD COLUMN notes       TEXT,
    ADD COLUMN confidence   VARCHAR(20);

-- source distinguishes a research-suggested Offer from a human's own selection, so writeback
-- can refuse to clobber a human choice; existing rows predate this feature and are treated as
-- human-authoritative. mapping_version records which version of the evidence->offer mapping
-- config produced an auto-assignment (see src/lib/mcp/offerMapping.ts).
ALTER TABLE offer_recommendations
    ADD COLUMN source           VARCHAR(20) NOT NULL DEFAULT 'human'
        CHECK (source IN ('human','research_auto')),
    ADD COLUMN mapping_version   VARCHAR(20);

-- Contacts: research-found confidence, alongside the provenance columns already added for the
-- multi-email/phone/company-link feature (source_url, evidence, added_by_type/name, is_verified).
ALTER TABLE contact_companies ADD COLUMN confidence VARCHAR(20);
ALTER TABLE contact_emails ADD COLUMN confidence VARCHAR(20);
ALTER TABLE contact_phones ADD COLUMN confidence VARCHAR(20);

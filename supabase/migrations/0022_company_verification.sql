-- Human verification (HITL) of AI-researched companies.
-- verification_status is a SEPARATE field from lead_status (which is untouched): NULL = not yet verified.
ALTER TABLE companies
    ADD COLUMN verification_status VARCHAR(40)
        CHECK (verification_status IN ('Ready for Outreach', 'Qualified - Incomplete'));

CREATE INDEX idx_companies_verification_status ON companies(verification_status);

-- One row per review. had_errors = the reviewer ticked "errors in this record";
-- fixed_all = their answer to "did you fix all the errors?" (NULL when there were no errors).
CREATE TABLE company_reviews (
    id             BIGSERIAL PRIMARY KEY,
    company_id     BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    reviewer_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewer_name  VARCHAR(255) NOT NULL,
    outcome        VARCHAR(40) NOT NULL CHECK (outcome IN ('Ready for Outreach', 'Qualified - Incomplete')),
    had_errors     BOOLEAN NOT NULL,
    fixed_all      BOOLEAN,
    notes          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_reviews_company_id ON company_reviews(company_id, created_at DESC);

-- The fields the reviewer ticked as incorrect (keys come from the app's field list).
CREATE TABLE company_review_fields (
    id         BIGSERIAL PRIMARY KEY,
    review_id  BIGINT NOT NULL REFERENCES company_reviews(id) ON DELETE CASCADE,
    field_key  VARCHAR(50) NOT NULL
);

CREATE INDEX idx_company_review_fields_review_id ON company_review_fields(review_id);
CREATE INDEX idx_company_review_fields_field_key ON company_review_fields(field_key);

GRANT SELECT ON company_reviews, company_review_fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON company_reviews, company_review_fields TO service_role;
GRANT USAGE, SELECT ON SEQUENCE company_reviews_id_seq, company_review_fields_id_seq TO service_role;

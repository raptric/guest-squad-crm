-- GuestSquad Prospecting CRM — V1 Database Schema
-- STATUS: Finalized for development.
-- Target: PostgreSQL, decided (not MySQL) — this schema already depends on Postgres-only
-- features (JSONB, partial unique indexes with WHERE clauses for the "one Primary offer" /
-- "one Primary offer_recommendation" rules), so there's no fallback path to MySQL without
-- redesigning those parts. Don't defer this choice any further.
-- Enums are implemented as VARCHAR + CHECK constraints rather than native PG enum types,
-- so adding a new option later is an ALTER ... DROP/ADD CONSTRAINT, not a type migration —
-- matches how these will be cast as PHP enums at the Laravel app layer.

CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE companies (
    id                          BIGSERIAL PRIMARY KEY,
    name                        VARCHAR(255) NOT NULL,
    website                     VARCHAR(255),
    company_type                VARCHAR(50) NOT NULL
        CHECK (company_type IN ('Property','Management Company','Ownership Company','Operator','Hotel Group / Portfolio','STR Management Company','Other')),
    parent_company_id           BIGINT REFERENCES companies(id) ON DELETE SET NULL,

    address_line_1               VARCHAR(255),
    address_line_2               VARCHAR(255),
    city                          VARCHAR(120),
    state                         VARCHAR(120),
    country                       VARCHAR(120),
    zip                           VARCHAR(20),
    phone                         VARCHAR(50),

    lifecycle_stage                   VARCHAR(30) NOT NULL DEFAULT 'Prospect'
        CHECK (lifecycle_stage IN ('Prospect','Lead','Sales Qualified Lead','Opportunity','Customer','Former Customer')),
    lead_status                       VARCHAR(30) NOT NULL DEFAULT 'New'
        CHECK (lead_status IN ('New','Researching','Needs Review','Qualified','Decision Maker Needed','Ready for Outreach','Outreach Active','Engaged','Nurture','Unqualified')),
    prospect_tier                     VARCHAR(20)
        CHECK (prospect_tier IN ('Tier 1','Tier 2','Tier 3','Do Not Pursue')),
    qualification_summary              TEXT,
    sdr_signal_summary                  TEXT, -- human-synthesized "why now" hook, drawn from company_signals/company_hiring_signals rows but written as one narrative, not tied to a single row

    source                                         VARCHAR(20) NOT NULL DEFAULT 'manual'
        CHECK (source IN ('google_maps','manual','referral','other')),
    owner_id                                        BIGINT REFERENCES users(id) ON DELETE SET NULL,
    custom_fields                                    JSONB NOT NULL DEFAULT '{}',

    created_at                                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                                        TIMESTAMPTZ -- soft delete (Laravel SoftDeletes). A CRM shouldn't hard-delete a company by accident and cascade away every rating/signal/activity ever logged against it.
);

CREATE INDEX idx_companies_city ON companies(city);
CREATE INDEX idx_companies_country ON companies(country);
CREATE INDEX idx_companies_company_type ON companies(company_type);
CREATE INDEX idx_companies_lifecycle_stage ON companies(lifecycle_stage);
CREATE INDEX idx_companies_lead_status ON companies(lead_status);
CREATE INDEX idx_companies_parent_company_id ON companies(parent_company_id);
CREATE INDEX idx_companies_owner_id ON companies(owner_id);
CREATE INDEX idx_companies_deleted_at ON companies(deleted_at);
CREATE UNIQUE INDEX idx_companies_website ON companies(website) WHERE website IS NOT NULL AND deleted_at IS NULL;

-- 1:1 extension of companies, only ever populated when companies.company_type = 'Property'.
-- A Management/Ownership/Operator/Portfolio company row has no matching row here at all —
-- no NULL property_type/rooms_units sitting on an entity that was never a physical property.
-- UNIQUE(company_id) enforces the 1:1; app layer only creates this row when company_type is
-- set (or switched) to 'Property'.
CREATE TABLE property_details (
    id              BIGSERIAL PRIMARY KEY,
    company_id       BIGINT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    property_type      VARCHAR(50)
        CHECK (property_type IN ('Hotel','Resort','Boutique Hotel','Aparthotel','Serviced Apartment','STR / Vacation Rental','B&B / Inn','Hostel','Other')),
    property_class       VARCHAR(20)
        CHECK (property_class IN ('1 Star','2 Star','3 Star','4 Star','5 Star','Luxury / Unrated','Unknown')),
    rooms_units             INTEGER CHECK (rooms_units >= 0),
    portfolio_role            VARCHAR(30)
        CHECK (portfolio_role IN ('Independent','Portfolio Property','Flagship','Managed Property','Franchised Property','Other')),
    portfolio_size              INTEGER CHECK (portfolio_size >= 0),
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_property_details_property_type ON property_details(property_type);

-- Enforces the "only Property rows get a property_details row" rule at the database level,
-- not just in the app. Without this, nothing stops a Management Company row from getting one
-- too. Fires on INSERT and UPDATE so it also catches company_id being repointed later.
CREATE FUNCTION enforce_property_details_company_type() RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM companies
        WHERE id = NEW.company_id AND company_type = 'Property'
    ) THEN
        RAISE EXCEPTION 'property_details.company_id % must reference a company with company_type = Property', NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_property_details_company_type
    BEFORE INSERT OR UPDATE ON property_details
    FOR EACH ROW EXECUTE FUNCTION enforce_property_details_company_type();

-- Child of property_details, NOT of companies directly — this is the correction from the
-- first pass. Referencing property_details(id) instead of companies(id) means the database
-- itself refuses a pain signal on a company that was never marked as a Property (no
-- property_details row = the FK insert fails), rather than that rule living only in app code.
-- Evolvable like company_signals: pain_type has no DB CHECK, validated in the app layer.
CREATE TABLE property_pain_signals (
    id              BIGSERIAL PRIMARY KEY,
    property_id      BIGINT NOT NULL REFERENCES property_details(id) ON DELETE CASCADE,
    pain_type          VARCHAR(60) NOT NULL, -- e.g. Calls, Reservations, After-hours, Check-in / Access, OTA Messaging, WhatsApp, Guest Requests, Front Desk Staffing, Reviews, Other — validated in the app, not the DB
    source_url          VARCHAR(500),
    detected_at            DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_property_pain_signals_property_id ON property_pain_signals(property_id);
CREATE INDEX idx_property_pain_signals_pain_type ON property_pain_signals(pain_type);

-- One row per channel per company. UNIQUE(company_id, channel) makes each research
-- refresh an upsert (INSERT ... ON CONFLICT DO UPDATE) rather than a new row — this
-- tracks current standing per channel, not a ratings history. New channels (vrbo, airbnb,
-- etc.) just need a new CHECK value, never a new column.
CREATE TABLE company_ratings (
    id              BIGSERIAL PRIMARY KEY,
    company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    channel           VARCHAR(30) NOT NULL
        CHECK (channel IN ('google','booking_com','expedia','hotels_com','tripadvisor','vrbo','airbnb','other')),
    rating              DECIMAL(3,1),
    review_count          INTEGER CHECK (review_count >= 0),
    captured_at            TIMESTAMPTZ NOT NULL DEFAULT now(), -- when this rating/count was last refreshed
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (company_id, channel)
);

CREATE INDEX idx_company_ratings_company_id ON company_ratings(company_id);
CREATE INDEX idx_company_ratings_channel ON company_ratings(channel);

-- Append-only, like activities — every hiring signal the agent detects is its own row,
-- never overwritten, so you keep a real record instead of one mutable "current" value.
-- No stored recency bucket: recency is always (now() - detected_at), computed in the app,
-- so it can never drift stale the way a cached "Active Now" label would.
-- No top-level hiring_signal Yes/No flag on companies either — "does this company have a
-- hiring signal" is just EXISTS(... WHERE company_id = ?), derived, not stored twice.
CREATE TABLE company_hiring_signals (
    id              BIGSERIAL PRIMARY KEY,
    company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role              VARCHAR(50)
        CHECK (role IN ('Front Desk / Reception','Night Auditor / Night Reception','Reservations','Guest Relations','Front Office Manager','Customer Service','Operations','Concierge','Telephone Operator / Call Center','Other')),
    job_title            VARCHAR(255), -- literal posting title (e.g. "Overnight Front Desk Agent - Weekends"), distinct from the categorized `role` bucket above
    strength               VARCHAR(10) CHECK (strength IN ('Strong','Medium','Weak','Unknown')),
    source_url               VARCHAR(500), -- the job posting link
    detected_at                DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_hiring_signals_company_id ON company_hiring_signals(company_id);
CREATE INDEX idx_company_hiring_signals_detected_at ON company_hiring_signals(detected_at);

-- Unified, non-hiring, company-level signals (management change, portfolio expansion,
-- guest-response complaints, etc.). Append-only like hiring signals — every detection is
-- its own row, all treated equally: no primary/secondary flag, nothing here is "the" signal.
-- signal_type deliberately has NO DB CHECK constraint, unlike every other enum-shaped column
-- in this schema: the whole point raised was that this list needs to keep growing, so
-- validation lives entirely in a PHP enum at the app layer — adding a new signal type is a
-- code change, not a migration. `strength` stays DB-checked since that 4-value scale is
-- structural and not expected to grow.
CREATE TABLE company_signals (
    id              BIGSERIAL PRIMARY KEY,
    company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    signal_type       VARCHAR(60) NOT NULL, -- e.g. Guest Response Complaints, Unanswered Calls, Slow Communication, After-hours Coverage Gap, Reservation Pressure, Check-in / Access Issues, OTA Messaging Issues, New Property Opening, Portfolio Expansion, Management Change, High Guest Volume, Seasonal Staffing Pressure, Other — validated in the app, not the DB
    strength            VARCHAR(10) CHECK (strength IN ('Strong','Medium','Weak','Unknown')),
    source_url            VARCHAR(500),
    detected_at             DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_signals_company_id ON company_signals(company_id);
CREATE INDEX idx_company_signals_signal_type ON company_signals(signal_type);
CREATE INDEX idx_company_signals_detected_at ON company_signals(detected_at);

-- This is NOT a signal — a signal is something observed (a hiring post, a complaint). This
-- is a decision/hypothesis the team (or later, the qualification agent) forms about which
-- GuestSquad service to lead the outreach with. `service` reuses the exact option set as the
-- Deal object's `gs_service_required` (see PRD.md 4.7), so when a recommendation turns into a
-- real deal, the same value carries straight through — no separate vocabulary to reconcile.
-- Exactly one Primary `type` per company is DB-enforced (idx_..._one_primary); any number of
-- Secondary rows are allowed. UNIQUE(company_id, service) stops the same service being
-- recommended twice. This drives V4's automated outreach: which campaign a company gets
-- enrolled into is read from its Primary row here.
CREATE TABLE offer_recommendations (
    id              BIGSERIAL PRIMARY KEY,
    company_id       BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    service           VARCHAR(40) NOT NULL
        CHECK (service IN ('After-hours Guest Support','Reservations','Full Guest Operations','Overflow Coverage','Front Desk Support','OTA / Messaging','Pilot','Other')),
    type                VARCHAR(10) NOT NULL
        CHECK (type IN ('Primary','Secondary')),
    rationale             TEXT, -- why this offer fits, drawing on the signal/pain-signal/rating rows
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (company_id, service)
);

CREATE INDEX idx_offer_recommendations_company_id ON offer_recommendations(company_id);
CREATE UNIQUE INDEX idx_offer_recommendations_one_primary ON offer_recommendations(company_id) WHERE type = 'Primary';

CREATE TABLE contacts (
    id                    BIGSERIAL PRIMARY KEY,
    company_id            BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    first_name             VARCHAR(120) NOT NULL,
    last_name               VARCHAR(120),
    email                    VARCHAR(255),
    phone                    VARCHAR(50),
    job_title                VARCHAR(120),
    contact_role              VARCHAR(40)
        CHECK (contact_role IN ('Owner / Founder','General Manager','Hotel Manager','VP / Director Operations','Regional Operations','Rooms Director','Front Office','Reservations','Revenue','Guest Relations','Other')),
    decision_maker_level       VARCHAR(30)
        CHECK (decision_maker_level IN ('Primary Decision Maker','Influencer','Secondary Contact','Unknown')),
    contact_line_type           VARCHAR(20)
        CHECK (contact_line_type IN ('Front Desk','Owner-Run','Unknown')), -- finalized as a committed field, see PRD.md section 11
    linkedin_url                 VARCHAR(255),
    custom_fields                 JSONB NOT NULL DEFAULT '{}',
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                     TIMESTAMPTZ -- soft delete (Laravel SoftDeletes), same reasoning as companies.deleted_at
);

CREATE INDEX idx_contacts_company_id ON contacts(company_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_deleted_at ON contacts(deleted_at);

CREATE TABLE activities (
    id              BIGSERIAL PRIMARY KEY,
    company_id       BIGINT REFERENCES companies(id) ON DELETE CASCADE,
    contact_id        BIGINT REFERENCES contacts(id) ON DELETE CASCADE,
    activity_type      VARCHAR(30) NOT NULL
        CHECK (activity_type IN ('note','call','email','research','qualification','status_change','outreach_sent','outreach_reply','error')),
    actor_type          VARCHAR(10) NOT NULL DEFAULT 'human'
        CHECK (actor_type IN ('human','agent')),
    actor_name            VARCHAR(120) NOT NULL,
    body                   TEXT,
    metadata                JSONB,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT activities_must_reference_something CHECK (company_id IS NOT NULL OR contact_id IS NOT NULL)
);

CREATE INDEX idx_activities_company_id ON activities(company_id);
CREATE INDEX idx_activities_contact_id ON activities(contact_id);
CREATE INDEX idx_activities_activity_type ON activities(activity_type);
CREATE INDEX idx_activities_created_at ON activities(created_at);

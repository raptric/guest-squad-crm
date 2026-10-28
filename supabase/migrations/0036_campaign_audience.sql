-- Campaign upgrade, step 2: the target audience (who a campaign is for) and the fit saved on each enrollment.
-- All criteria are optional; an empty list / NULL means "not a criterion".
ALTER TABLE campaigns
    ADD COLUMN target_company_types  TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN target_property_types TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN rooms_min             INTEGER CHECK (rooms_min IS NULL OR rooms_min >= 0),
    ADD COLUMN rooms_max             INTEGER CHECK (rooms_max IS NULL OR rooms_max >= 0),
    ADD COLUMN target_portfolio      VARCHAR(12) NOT NULL DEFAULT 'any' CHECK (target_portfolio IN ('any', 'independent', 'portfolio')),
    ADD COLUMN target_countries      TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN target_states         TEXT[] NOT NULL DEFAULT '{}',
    ADD CONSTRAINT campaigns_rooms_order CHECK (rooms_min IS NULL OR rooms_max IS NULL OR rooms_min <= rooms_max);

-- The fit of the company for the campaign at the moment it was enrolled (strong / partial / weak) and why.
ALTER TABLE campaign_enrollments
    ADD COLUMN fit_label  VARCHAR(10) CHECK (fit_label IN ('strong', 'partial', 'weak')),
    ADD COLUMN fit_detail JSONB;

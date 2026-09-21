-- Dashboard: one row of computed facts per live company, and a summary function that groups
-- and counts them. Definitions:
--   portfolio     = a "Hotel Group / Portfolio" company, or any company with properties under it
--   independent   = a property with role Independent and no parent company
--   contact stage = 1 no contact, 2 contact but no decision-maker, 3 decision-maker not yet
--                   verified/reachable, 4 outreach-ready (verified Primary Decision Maker with a
--                   verified email or phone for this company or general)

CREATE OR REPLACE VIEW company_facts AS
SELECT
    c.id,
    c.company_type,
    c.lead_status,
    c.lifecycle_stage,
    COALESCE(NULLIF(TRIM(c.country), ''), '(not set)') AS country,
    COALESCE(NULLIF(TRIM(c.state), ''), '(not set)')   AS state,
    COALESCE(NULLIF(TRIM(c.city), ''), '(not set)')    AS city,
    (c.company_type = 'Property') AS is_property,
    (c.company_type = 'Hotel Group / Portfolio'
        OR EXISTS (SELECT 1 FROM companies k WHERE k.parent_company_id = c.id AND k.deleted_at IS NULL)) AS is_portfolio,
    (COALESCE(pd.portfolio_role = 'Independent', false) AND c.parent_company_id IS NULL) AS is_independent,
    COALESCE(ct.contact_count, 0) AS contact_count,
    COALESCE(ct.has_dm, false)    AS has_decision_maker,
    COALESCE(ct.outreach_ready, false) AS outreach_ready,
    CASE
        WHEN COALESCE(ct.contact_count, 0) = 0 THEN 1
        WHEN NOT COALESCE(ct.has_dm, false) THEN 2
        WHEN NOT COALESCE(ct.outreach_ready, false) THEN 3
        ELSE 4
    END AS contact_stage
FROM companies c
LEFT JOIN property_details pd ON pd.company_id = c.id
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS contact_count,
        BOOL_OR(cc.decision_maker_level = 'Primary Decision Maker') AS has_dm,
        BOOL_OR(
            cc.decision_maker_level = 'Primary Decision Maker' AND cc.is_verified AND (
                EXISTS (SELECT 1 FROM contact_emails e
                         WHERE e.contact_id = cc.contact_id AND e.is_verified
                           AND (e.company_id IS NULL OR e.company_id = c.id))
                OR EXISTS (SELECT 1 FROM contact_phones p
                            WHERE p.contact_id = cc.contact_id AND p.is_verified
                              AND (p.company_id IS NULL OR p.company_id = c.id))
            )
        ) AS outreach_ready
    FROM contact_companies cc
    JOIN contacts k ON k.id = cc.contact_id AND k.deleted_at IS NULL
    WHERE cc.company_id = c.id
) ct ON true
WHERE c.deleted_at IS NULL;

-- Grouped counts. p_group_by: country | state | city | status | type | none.
-- Filters are exact matches (NULL = no filter). The q_* columns form the qualified-lead funnel.
CREATE OR REPLACE FUNCTION dashboard_summary(
    p_country  TEXT DEFAULT NULL,
    p_state    TEXT DEFAULT NULL,
    p_city     TEXT DEFAULT NULL,
    p_status   TEXT DEFAULT NULL,
    p_type     TEXT DEFAULT NULL,
    p_group_by TEXT DEFAULT 'none'
)
RETURNS TABLE (
    group_value        TEXT,
    n_total            BIGINT,
    n_properties       BIGINT,
    n_portfolios       BIGINT,
    n_independent      BIGINT,
    n_pending          BIGINT,
    n_needs_review     BIGINT,
    n_qualified        BIGINT,
    n_disqualified     BIGINT,
    n_stage1           BIGINT,
    n_stage2           BIGINT,
    n_stage3           BIGINT,
    n_stage4           BIGINT,
    n_q_with_contact   BIGINT,
    n_q_with_dm        BIGINT,
    n_q_ready          BIGINT
)
LANGUAGE sql STABLE AS $$
    SELECT
        g.grp,
        COUNT(*),
        COUNT(*) FILTER (WHERE g.is_property),
        COUNT(*) FILTER (WHERE g.is_portfolio),
        COUNT(*) FILTER (WHERE g.is_independent),
        COUNT(*) FILTER (WHERE g.lead_status = 'New'),
        COUNT(*) FILTER (WHERE g.lead_status = 'Needs Review'),
        COUNT(*) FILTER (WHERE g.lead_status = 'Qualified'),
        COUNT(*) FILTER (WHERE g.lead_status = 'DisQualified'),
        COUNT(*) FILTER (WHERE g.contact_stage = 1),
        COUNT(*) FILTER (WHERE g.contact_stage = 2),
        COUNT(*) FILTER (WHERE g.contact_stage = 3),
        COUNT(*) FILTER (WHERE g.contact_stage = 4),
        COUNT(*) FILTER (WHERE g.lead_status = 'Qualified' AND g.contact_count > 0),
        COUNT(*) FILTER (WHERE g.lead_status = 'Qualified' AND g.has_decision_maker),
        COUNT(*) FILTER (WHERE g.lead_status = 'Qualified' AND g.outreach_ready)
    FROM (
        SELECT f.*,
            CASE p_group_by
                WHEN 'country' THEN f.country
                WHEN 'state'   THEN f.state
                WHEN 'city'    THEN f.city
                WHEN 'status'  THEN f.lead_status
                WHEN 'type'    THEN f.company_type
                ELSE 'All'
            END AS grp
        FROM company_facts f
        WHERE (p_country IS NULL OR f.country = p_country)
          AND (p_state   IS NULL OR f.state = p_state)
          AND (p_city    IS NULL OR f.city = p_city)
          AND (p_status  IS NULL OR f.lead_status = p_status)
          AND (p_type    IS NULL OR f.company_type = p_type)
    ) g
    GROUP BY g.grp
    ORDER BY 2 DESC, 1;
$$;

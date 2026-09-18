-- Extends the picklist_values system (0006) to 11 more fields that were still locked to a
-- fixed DB CHECK. Same rationale as lead_status/lifecycle_stage: an admin can add/remove
-- options from /settings without a migration or deploy.
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_company_type_check;
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_prospect_tier_check;
ALTER TABLE property_details DROP CONSTRAINT IF EXISTS property_details_property_type_check;
ALTER TABLE property_details DROP CONSTRAINT IF EXISTS property_details_property_class_check;
ALTER TABLE property_details DROP CONSTRAINT IF EXISTS property_details_portfolio_role_check;
ALTER TABLE company_hiring_signals DROP CONSTRAINT IF EXISTS company_hiring_signals_role_check;
ALTER TABLE company_hiring_signals DROP CONSTRAINT IF EXISTS company_hiring_signals_strength_check;
ALTER TABLE company_signals DROP CONSTRAINT IF EXISTS company_signals_strength_check;
ALTER TABLE offer_recommendations DROP CONSTRAINT IF EXISTS offer_recommendations_service_check;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_contact_role_check;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_decision_maker_level_check;
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_contact_line_type_check;

INSERT INTO picklist_values (field_name, value, sort_order) VALUES
    ('company_type', 'Property', 1),
    ('company_type', 'Management Company', 2),
    ('company_type', 'Ownership Company', 3),
    ('company_type', 'Operator', 4),
    ('company_type', 'Hotel Group / Portfolio', 5),
    ('company_type', 'STR Management Company', 6),
    ('company_type', 'Other', 7),

    ('property_type', 'Hotel', 1),
    ('property_type', 'Resort', 2),
    ('property_type', 'Boutique Hotel', 3),
    ('property_type', 'Aparthotel', 4),
    ('property_type', 'Serviced Apartment', 5),
    ('property_type', 'STR / Vacation Rental', 6),
    ('property_type', 'B&B / Inn', 7),
    ('property_type', 'Hostel', 8),
    ('property_type', 'Other', 9),

    ('property_class', '1 Star', 1),
    ('property_class', '2 Star', 2),
    ('property_class', '3 Star', 3),
    ('property_class', '4 Star', 4),
    ('property_class', '5 Star', 5),
    ('property_class', 'Luxury / Unrated', 6),
    ('property_class', 'Unknown', 7),

    ('portfolio_role', 'Independent', 1),
    ('portfolio_role', 'Portfolio Property', 2),
    ('portfolio_role', 'Flagship', 3),
    ('portfolio_role', 'Managed Property', 4),
    ('portfolio_role', 'Franchised Property', 5),
    ('portfolio_role', 'Other', 6),

    ('prospect_tier', 'Tier 1', 1),
    ('prospect_tier', 'Tier 2', 2),
    ('prospect_tier', 'Tier 3', 3),
    ('prospect_tier', 'Do Not Pursue', 4),

    ('hiring_signal_role', 'Front Desk / Reception', 1),
    ('hiring_signal_role', 'Night Auditor / Night Reception', 2),
    ('hiring_signal_role', 'Reservations', 3),
    ('hiring_signal_role', 'Guest Relations', 4),
    ('hiring_signal_role', 'Front Office Manager', 5),
    ('hiring_signal_role', 'Customer Service', 6),
    ('hiring_signal_role', 'Operations', 7),
    ('hiring_signal_role', 'Concierge', 8),
    ('hiring_signal_role', 'Telephone Operator / Call Center', 9),
    ('hiring_signal_role', 'Other', 10),

    ('strength', 'Strong', 1),
    ('strength', 'Medium', 2),
    ('strength', 'Weak', 3),
    ('strength', 'Unknown', 4),

    ('offer_service', 'After-hours Guest Support', 1),
    ('offer_service', 'Reservations', 2),
    ('offer_service', 'Full Guest Operations', 3),
    ('offer_service', 'Overflow Coverage', 4),
    ('offer_service', 'Front Desk Support', 5),
    ('offer_service', 'OTA / Messaging', 6),
    ('offer_service', 'Pilot', 7),
    ('offer_service', 'Other', 8),

    ('contact_role', 'Owner / Founder', 1),
    ('contact_role', 'General Manager', 2),
    ('contact_role', 'Hotel Manager', 3),
    ('contact_role', 'VP / Director Operations', 4),
    ('contact_role', 'Regional Operations', 5),
    ('contact_role', 'Rooms Director', 6),
    ('contact_role', 'Front Office', 7),
    ('contact_role', 'Reservations', 8),
    ('contact_role', 'Revenue', 9),
    ('contact_role', 'Guest Relations', 10),
    ('contact_role', 'Other', 11),

    ('decision_maker_level', 'Primary Decision Maker', 1),
    ('decision_maker_level', 'Influencer', 2),
    ('decision_maker_level', 'Secondary Contact', 3),
    ('decision_maker_level', 'Unknown', 4),

    ('contact_line_type', 'Front Desk', 1),
    ('contact_line_type', 'Owner-Run', 2),
    ('contact_line_type', 'Unknown', 3)
ON CONFLICT (field_name, value) DO NOTHING;

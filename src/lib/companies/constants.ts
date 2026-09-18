// The following are admin-editable via /settings (picklist_values table), fetched with
// getPicklistValues()/fetchPicklistValues() from lib/picklists.ts -- no longer fixed here:
// lead_status, lifecycle_stage, company_type, property_type, property_class, portfolio_role,
// prospect_tier, hiring_signal_role (company_hiring_signals.role), strength
// (company_signals.strength / company_hiring_signals.strength), offer_service
// (offer_recommendations.service), contact_role, decision_maker_level, contact_line_type.

export const RATING_CHANNELS = [
  "google",
  "booking_com",
  "expedia",
  "hotels_com",
  "tripadvisor",
  "vrbo",
  "airbnb",
  "other",
] as const;

// No DB CHECK on these two -- validated at the app layer so the list can grow without a
// migration (see schema.sql comments on company_signals / property_pain_signals). Left as
// plain code constants rather than an admin picklist: an API/agent write should be able to
// introduce a new value without needing an admin to pre-register it first.
export const COMPANY_SIGNAL_TYPES = [
  "Guest Response Complaints",
  "Unanswered Calls",
  "Slow Communication",
  "After-hours Coverage Gap",
  "Reservation Pressure",
  "Check-in / Access Issues",
  "OTA Messaging Issues",
  "New Property Opening",
  "Portfolio Expansion",
  "Management Change",
  "High Guest Volume",
  "Seasonal Staffing Pressure",
  "Other",
] as const;

export const PAIN_SIGNAL_TYPES = [
  "Calls",
  "Reservations",
  "After-hours",
  "Check-in / Access",
  "OTA Messaging",
  "WhatsApp",
  "Guest Requests",
  "Front Desk Staffing",
  "Reviews",
  "Other",
] as const;

// V1 only writes these manually; the enum has V2-V4 values too (research, outreach_sent, etc.)
export const MANUAL_ACTIVITY_TYPES = ["note", "call", "email", "status_change"] as const;

// Structural, not a label list -- drives the one-Primary-per-company DB constraint, so this
// stays a fixed code value, not an admin-editable picklist.
export const OFFER_TYPES = ["Primary", "Secondary"] as const;

// The three outcomes a research pass can end in, matching the current lead_status picklist
// (New / Needs Review / Qualified / DisQualified -- New is the starting state, not a research
// outcome). Qualified is the only one that also advances lifecycle_stage to "Sales Qualified".
export const RESEARCH_OUTCOMES = ["Qualified", "Needs Review", "DisQualified"] as const;

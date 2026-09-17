export const COMPANY_TYPES = [
  "Property",
  "Management Company",
  "Ownership Company",
  "Operator",
  "Hotel Group / Portfolio",
  "STR Management Company",
  "Other",
] as const;

export const LIFECYCLE_STAGES = [
  "Prospect",
  "Lead",
  "Sales Qualified Lead",
  "Opportunity",
  "Customer",
  "Former Customer",
] as const;

export const LEAD_STATUSES = [
  "New",
  "Researching",
  "Needs Review",
  "Qualified",
  "Decision Maker Needed",
  "Ready for Outreach",
  "Outreach Active",
  "Engaged",
  "Nurture",
  "Unqualified",
] as const;

export const PROSPECT_TIERS = ["Tier 1", "Tier 2", "Tier 3", "Do Not Pursue"] as const;

export const PROPERTY_TYPES = [
  "Hotel",
  "Resort",
  "Boutique Hotel",
  "Aparthotel",
  "Serviced Apartment",
  "STR / Vacation Rental",
  "B&B / Inn",
  "Hostel",
  "Other",
] as const;

export const PROPERTY_CLASSES = [
  "1 Star",
  "2 Star",
  "3 Star",
  "4 Star",
  "5 Star",
  "Luxury / Unrated",
  "Unknown",
] as const;

// Types that can act as a portfolio/group parent -- everything except a physical Property.
export const PORTFOLIO_CAPABLE_TYPES = COMPANY_TYPES.filter((t) => t !== "Property");

export const PORTFOLIO_ROLES = [
  "Independent",
  "Portfolio Property",
  "Flagship",
  "Managed Property",
  "Franchised Property",
  "Other",
] as const;

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

export const STRENGTH_LEVELS = ["Strong", "Medium", "Weak", "Unknown"] as const;

export const HIRING_SIGNAL_ROLES = [
  "Front Desk / Reception",
  "Night Auditor / Night Reception",
  "Reservations",
  "Guest Relations",
  "Front Office Manager",
  "Customer Service",
  "Operations",
  "Concierge",
  "Telephone Operator / Call Center",
  "Other",
] as const;

// No DB CHECK on these two -- validated at the app layer so the list can grow without a
// migration (see schema.sql comments on company_signals / property_pain_signals).
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

export const CONTACT_ROLES = [
  "Owner / Founder",
  "General Manager",
  "Hotel Manager",
  "VP / Director Operations",
  "Regional Operations",
  "Rooms Director",
  "Front Office",
  "Reservations",
  "Revenue",
  "Guest Relations",
  "Other",
] as const;

export const DECISION_MAKER_LEVELS = [
  "Primary Decision Maker",
  "Influencer",
  "Secondary Contact",
  "Unknown",
] as const;

export const CONTACT_LINE_TYPES = ["Front Desk", "Owner-Run", "Unknown"] as const;

// V1 only writes these manually; the enum has V2-V4 values too (research, outreach_sent, etc.)
export const MANUAL_ACTIVITY_TYPES = ["note", "call", "email", "status_change"] as const;

export const OFFER_SERVICES = [
  "After-hours Guest Support",
  "Reservations",
  "Full Guest Operations",
  "Overflow Coverage",
  "Front Desk Support",
  "OTA / Messaging",
  "Pilot",
  "Other",
] as const;

export const OFFER_TYPES = ["Primary", "Secondary"] as const;

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

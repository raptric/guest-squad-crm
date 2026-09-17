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

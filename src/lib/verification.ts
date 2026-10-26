// Human verification of AI-researched companies. verification_status is its own field,
// separate from lead_status.
export const VERIFICATION_READY = "Ready for Outreach";
export const VERIFICATION_INCOMPLETE = "Qualified - Incomplete";
export type VerificationStatus = typeof VERIFICATION_READY | typeof VERIFICATION_INCOMPLETE;

// What people see. The stored value stays "Ready for Outreach" (campaigns and filters read it); "Ready for Outreach" is
// now a pipeline stage, so the verification field just says Verified.
export const verificationLabel = (v: string | null | undefined) => (v === VERIFICATION_READY ? "Verified" : v ?? "Not verified");

// The tick list shown when a reviewer reports errors. Keys are stored in company_review_fields.
export const VERIFY_FIELD_GROUPS: { title: string; fields: { key: string; label: string }[] }[] = [
  {
    title: "Property",
    fields: [
      { key: "website", label: "Website" },
      { key: "phone", label: "Phone" },
      { key: "address", label: "Address" },
      { key: "property_type", label: "Property type" },
      { key: "rooms_class", label: "Rooms / class" },
    ],
  },
  {
    title: "Ownership",
    fields: [
      { key: "owner", label: "Owner" },
      { key: "operator_management", label: "Operator / management company" },
      { key: "brand_parent", label: "Brand / parent" },
    ],
  },
  {
    title: "Reputation & signals",
    fields: [
      { key: "ratings", label: "Ratings" },
      { key: "pain_signals", label: "Pain signals" },
      { key: "hiring_signals", label: "Hiring signals" },
    ],
  },
  {
    title: "People & offer",
    fields: [
      { key: "decision_maker", label: "Decision maker" },
      { key: "offers", label: "Offers" },
      { key: "tier", label: "Tier" },
      { key: "other", label: "Other" },
    ],
  },
];

export const VERIFY_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  VERIFY_FIELD_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f.label]))
);

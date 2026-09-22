// Evidence-tag -> Offer mapping, server-side and editable here (not inside research skills).
// Maps ONLY onto values that actually exist in the offer_service picklist (Settings) -- never
// hardcodes a new value. The prompt that requested this feature suggested candidate Offer names
// (e.g. "Hotel Answering Service", "OTA Inbox Management") that do not exist in this CRM's real
// picklist (After-hours Guest Support, Reservations, Full Guest Operations, Overflow Coverage,
// Front Desk Support, OTA / Messaging, Pilot, Other) -- those suggestions were remapped here onto
// the closest real value; a research category with no confident real equivalent (vacation-rental/
// Airbnb-specific, maintenance escalation, generic cost/staffing efficiency) is left unmapped on
// purpose rather than forced into the wrong bucket. "Pilot" and "Other" are never auto-assigned.
//
// The tags below are this module's own documented vocabulary -- see canonicalResult.ts's header
// comment on why no external schema for research evidence exists to align to instead. Align a
// real research runner's evidence categories to these tag names (or extend the tag-detection
// heuristics in deriveEvidenceTags below) rather than fabricating new Offer values.
export const OFFER_MAPPING_VERSION = "v1";

export type EvidenceTag =
  | "missed_calls_or_lost_bookings"
  | "reservation_support_issues"
  | "guest_messaging_overload"
  | "ota_inbox_issues"
  | "after_hours_gap"
  | "back_office_or_maintenance_escalation"
  | "portfolio_scale_or_standardization"
  | "front_desk_staffing_gap"
  | "front_desk_overflow";

const PRIMARY_MAP: Partial<Record<EvidenceTag, string>> = {
  missed_calls_or_lost_bookings: "After-hours Guest Support",
  after_hours_gap: "After-hours Guest Support",
  reservation_support_issues: "Reservations",
  guest_messaging_overload: "OTA / Messaging",
  ota_inbox_issues: "OTA / Messaging",
  back_office_or_maintenance_escalation: "Full Guest Operations",
  portfolio_scale_or_standardization: "Full Guest Operations",
};

const SECONDARY_MAP: Partial<Record<EvidenceTag, string>> = {
  front_desk_staffing_gap: "Front Desk Support",
  missed_calls_or_lost_bookings: "After-hours Guest Support",
  after_hours_gap: "After-hours Guest Support",
  guest_messaging_overload: "OTA / Messaging",
  front_desk_overflow: "Overflow Coverage",
  portfolio_scale_or_standardization: "Full Guest Operations",
};

// Conservative keyword detection over the pain/hiring/portfolio evidence this MCP actually
// parses (see canonicalResult.ts). Deliberately narrow: a miss just means no auto-suggestion
// (safe default), a false positive would mis-categorize a real lead, so keywords stay specific.
export function deriveEvidenceTags(input: {
  painTypes: string[];
  hiringRoles: string[];
  isPortfolio: boolean;
  siblingCount: number;
}): EvidenceTag[] {
  const tags = new Set<EvidenceTag>();
  const pain = input.painTypes.map((p) => p.toLowerCase());

  if (pain.some((p) => p.includes("call") || p.includes("unanswered") || p.includes("missed"))) tags.add("missed_calls_or_lost_bookings");
  if (pain.some((p) => p.includes("reservation"))) tags.add("reservation_support_issues");
  if (pain.some((p) => p.includes("messag") || p.includes("whatsapp") || p.includes("guest request"))) tags.add("guest_messaging_overload");
  if (pain.some((p) => p.includes("ota"))) tags.add("ota_inbox_issues");
  if (pain.some((p) => p.includes("after-hours") || p.includes("after hours") || p.includes("check-in") || p.includes("check in") || p.includes("access"))) {
    tags.add("after_hours_gap");
  }
  if (pain.some((p) => p.includes("front desk staffing"))) tags.add("front_desk_staffing_gap");
  if (pain.some((p) => p.includes("high guest volume") || p.includes("seasonal staffing"))) tags.add("front_desk_overflow");

  if (input.hiringRoles.some((r) => r.toLowerCase().includes("front desk") || r.toLowerCase().includes("front office"))) {
    tags.add("front_desk_staffing_gap");
  }
  if (input.isPortfolio && input.siblingCount >= 2) tags.add("portfolio_scale_or_standardization");

  return [...tags];
}

export type OfferSuggestion = { primary: string | null; secondary: string[]; tags: EvidenceTag[]; version: string };

// availableOptions must come from the real picklist (list_offer_options) -- never assumes the
// mapped names still exist.
export function suggestOffers(tags: EvidenceTag[], availableOptions: readonly string[]): OfferSuggestion {
  const primaryCandidates = tags.map((t) => PRIMARY_MAP[t]).filter((v): v is string => v !== undefined && availableOptions.includes(v));
  const primary = primaryCandidates[0] ?? null;
  const secondary = [
    ...new Set(tags.map((t) => SECONDARY_MAP[t]).filter((v): v is string => v !== undefined && availableOptions.includes(v) && v !== primary)),
  ];
  return { primary, secondary, tags, version: OFFER_MAPPING_VERSION };
}

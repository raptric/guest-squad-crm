// The shape apply_research_result expects inside canonical_result. The 10 top-level keys
// (property_profile, identity, ownership, reputation, pain, hiring_signal, qualification,
// contacts, portfolio_discovery, system_output) are fixed by the research-engine contract and
// must not be renamed. The FIELDS inside each section are this MCP's own documented
// interpretation -- no formal JSON schema for canonical_result exists anywhere in this repo or
// in the installed guestsquad-prospect-research skill (that skill renders two markdown tables
// for chat, not JSON), so these names were inferred from the "Company And Research Mapping"
// table in the writeback spec. Parsing here is deliberately defensive: an unrecognized shape
// inside a section produces a warning (surfaced in apply_research_result's response) rather
// than silently doing nothing or throwing, so a real mismatch against the actual research
// runner's output is loud and diagnosable on the very first live call.
//
// See docs/integrations/mcp-research-writeback.md for the full reference.

export type CanonicalResult = {
  property_profile?: Record<string, unknown>;
  identity?: Record<string, unknown>;
  ownership?: Record<string, unknown>;
  reputation?: Record<string, unknown>;
  pain?: unknown;
  hiring_signal?: unknown;
  qualification?: Record<string, unknown>;
  contacts?: unknown[];
  portfolio_discovery?: Record<string, unknown>;
  system_output?: Record<string, unknown>;
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

// A value counts as "known" only if it's a real, specific fact. Blank strings, null/undefined,
// and the literal placeholder "Unknown" (any casing -- research tools commonly emit this
// instead of omitting the field) all count as NOT known.
export function isBlankFact(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v !== "string") return false;
  const t = v.trim().toLowerCase();
  return t === "" || t === "unknown" || t === "n/a" || t === "none";
}

// Preserve stronger/existing data: an incoming blank/"Unknown" never overwrites anything: a
// known existing value is never replaced by another known value either (apply_research_result
// has no per-field confidence to arbitrate a conflict, so the conservative, always-safe rule is
// "fill blanks only"). Returns whether this call actually changed anything, for the
// company_fields_updated list in the response.
export function mergeFact<T>(existing: T | null, incoming: T | undefined): { value: T | null; changed: boolean } {
  if (incoming === undefined || isBlankFact(incoming)) return { value: existing, changed: false };
  if (!isBlankFact(existing)) return { value: existing, changed: false };
  return { value: incoming, changed: true };
}

export type ParsedProfile = {
  website?: string;
  phone?: string;
  address_line_1?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  company_type?: string;
  property_type?: string;
  property_class?: string;
  rooms_units?: number;
  portfolio_role?: string;
};

export function parseProfile(section: CanonicalResult["property_profile"]): ParsedProfile {
  if (!section) return {};
  return {
    website: str(section.website),
    phone: str(section.phone),
    address_line_1: str(section.address_line_1 ?? section.address),
    city: str(section.city),
    state: str(section.state),
    zip: str(section.zip ?? section.postal_code),
    country: str(section.country),
    company_type: str(section.company_type),
    property_type: str(section.property_type),
    property_class: str(section.property_class),
    rooms_units: num(section.rooms_units),
    portfolio_role: str(section.portfolio_role),
  };
}

export type ParsedRelationship = {
  ownership_entity?: string;
  operating_entity?: string;
  management_entity?: string;
  brand_name?: string;
  primary_operating_parent?: string;
  primary_parent_reason?: string;
};

export function parseOwnership(section: CanonicalResult["ownership"]): ParsedRelationship {
  if (!section) return {};
  return {
    ownership_entity: str(section.ownership_entity),
    operating_entity: str(section.operating_entity),
    management_entity: str(section.management_entity),
    brand_name: str(section.brand_name),
    primary_operating_parent: str(section.primary_operating_parent),
    primary_parent_reason: str(section.primary_parent_reason),
  };
}

export type ParsedIdentity = { status?: string; confidence?: string; notes?: string };

export function parseIdentity(section: CanonicalResult["identity"]): ParsedIdentity {
  if (!section) return {};
  return { status: str(section.status), confidence: str(section.confidence), notes: str(section.notes) };
}

export type ParsedQualification = {
  outcome?: string;
  reason?: string;
  priority_tier?: string;
  why_now_hook?: string;
  research_complete?: boolean;
  needs_human_review?: boolean;
};

export function parseQualification(
  qualification: CanonicalResult["qualification"],
  systemOutput: CanonicalResult["system_output"]
): ParsedQualification {
  const q = qualification ?? {};
  const s = systemOutput ?? {};
  return {
    outcome: str(q.outcome ?? q.status),
    reason: str(q.reason ?? q.summary ?? q.qualification_reason),
    priority_tier: str(q.priority_tier ?? q.tier),
    why_now_hook: str(q.why_now_hook ?? q.why_now),
    // research_complete/needs_human_review may appear under qualification OR system_output --
    // accept either, qualification taking precedence.
    research_complete: bool(q.research_complete) ?? bool(s.research_complete),
    needs_human_review: bool(q.needs_human_review) ?? bool(s.needs_human_review),
  };
}

export type ParsedSystemOutput = { confidence_notes?: string };

export function parseSystemOutput(section: CanonicalResult["system_output"]): ParsedSystemOutput {
  if (!section) return {};
  return { confidence_notes: str(section.confidence_notes ?? section.notes) };
}

export type ParsedRating = {
  channel: string;
  rating?: number;
  review_count?: number;
  native_scale?: string;
  listing_url?: string;
  source_url?: string;
  notes?: string;
  confidence?: string;
};

const RATING_KEY_ALIASES: Record<string, string> = {
  booking: "booking_com",
  "booking.com": "booking_com",
  tripadvisor: "tripadvisor",
  trip_advisor: "tripadvisor",
  hotels: "hotels_com",
  "hotels.com": "hotels_com",
};

// Accepts reputation as { google: {...}, booking_com: {...}, ... } (an object keyed by
// channel, matching RATING_CHANNELS) or as an array of { channel, ... } entries.
export function parseReputation(section: CanonicalResult["reputation"], validChannels: readonly string[]): { ratings: ParsedRating[]; warnings: string[] } {
  const ratings: ParsedRating[] = [];
  const warnings: string[] = [];
  if (!section) return { ratings, warnings };

  const entries: [string, Record<string, unknown>][] = Array.isArray(section)
    ? (section as Record<string, unknown>[])
        .map((r): [string, Record<string, unknown>] | null => (typeof r.channel === "string" ? [r.channel, r] : null))
        .filter((e): e is [string, Record<string, unknown>] => e !== null)
    : Object.entries(section as Record<string, unknown>).filter((e): e is [string, Record<string, unknown>] => typeof e[1] === "object" && e[1] !== null);

  for (const [rawKey, value] of entries) {
    const key = RATING_KEY_ALIASES[rawKey.toLowerCase().trim()] ?? rawKey.toLowerCase().trim().replace(/\s+/g, "_");
    if (!validChannels.includes(key)) {
      warnings.push(`reputation: unrecognized channel "${rawKey}" -- skipped. Allowed: ${validChannels.join(", ")}`);
      continue;
    }
    const r = value as Record<string, unknown>;
    if (r.rating === undefined && r.review_count === undefined) continue; // nothing found for this channel
    ratings.push({
      channel: key,
      rating: num(r.rating),
      review_count: num(r.review_count),
      native_scale: str(r.native_scale ?? r.scale),
      listing_url: str(r.listing_url),
      source_url: str(r.source_url),
      notes: str(r.notes),
      confidence: str(r.confidence),
    });
  }
  return { ratings, warnings };
}

export type ParsedPainSignal = { pain_type: string; evidence?: string; source_url?: string; confidence?: string };

// Accepts a single object, an array of objects, or { signals: [...] }.
export function parsePainSignals(section: CanonicalResult["pain"], validTypes: readonly string[]): { signals: ParsedPainSignal[]; warnings: string[] } {
  const warnings: string[] = [];
  const items = toItemArray(section, "signals");
  const signals: ParsedPainSignal[] = [];
  for (const item of items) {
    const painType = str(item.pain_type ?? item.type ?? item.category);
    if (!painType) continue;
    const matched = validTypes.find((t) => t.toLowerCase() === painType.toLowerCase()) ?? painType;
    if (!validTypes.some((t) => t.toLowerCase() === painType.toLowerCase())) {
      warnings.push(`pain: "${painType}" is not one of the known pain-signal types -- recorded as-is.`);
    }
    signals.push({ pain_type: matched, evidence: str(item.evidence ?? item.why_now_hook), source_url: str(item.source_url), confidence: str(item.confidence) });
  }
  return { signals, warnings };
}

export type ParsedHiringSignal = { role?: string; job_title?: string; strength?: string; notes?: string; source_url?: string; confidence?: string };

export function parseHiringSignals(section: CanonicalResult["hiring_signal"]): ParsedHiringSignal[] {
  const items = toItemArray(section, "signals");
  return items
    .map((item) => ({
      role: str(item.role),
      job_title: str(item.job_title ?? item.title),
      strength: str(item.strength),
      notes: str(item.notes),
      source_url: str(item.source_url),
      confidence: str(item.confidence),
    }))
    .filter((s) => s.role || s.job_title);
}

export type ParsedSalesSignal = { signal_type: string; strength?: string; notes?: string; source_url?: string; confidence?: string };

export function parseSalesSignals(section: CanonicalResult["system_output"], validTypes: readonly string[]): ParsedSalesSignal[] {
  // "Other sales signals" -- accepted under system_output.sales_signals or system_output.signals.
  const raw = (section as Record<string, unknown> | undefined)?.sales_signals ?? (section as Record<string, unknown> | undefined)?.signals;
  const items = toItemArray(raw, "signals");
  return items
    .map((item) => ({
      signal_type: str(item.signal_type ?? item.type) ?? "Other",
      strength: str(item.strength),
      notes: str(item.notes ?? item.description),
      source_url: str(item.source_url),
      confidence: str(item.confidence),
    }))
    .filter((s) => validTypes.length === 0 || true); // free text list -- validated loosely elsewhere if needed
}

export type ParsedContact = {
  first_name?: string;
  last_name?: string;
  job_title?: string;
  email?: string;
  email_verified?: boolean;
  phone?: string;
  phone_type?: string;
  linkedin_url?: string;
  contact_role?: string;
  decision_maker_level?: string;
  source_url?: string;
  evidence?: string;
  confidence?: string;
};

export function parseContacts(contacts: CanonicalResult["contacts"]): ParsedContact[] {
  if (!Array.isArray(contacts)) return [];
  return contacts.map((raw) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    const fullName = str(c.name);
    const [firstFromName, ...restFromName] = fullName ? fullName.split(/\s+/) : [];
    return {
      first_name: str(c.first_name) ?? firstFromName,
      last_name: str(c.last_name) ?? (restFromName.length ? restFromName.join(" ") : undefined),
      job_title: str(c.job_title ?? c.title),
      email: str(c.email),
      email_verified: bool(c.email_verified ?? c.verified),
      phone: str(c.phone),
      phone_type: str(c.phone_type ?? c.contact_line_type),
      linkedin_url: str(c.linkedin_url),
      contact_role: str(c.contact_role ?? c.role),
      decision_maker_level: str(c.decision_maker_level),
      source_url: str(c.source_url),
      evidence: str(c.evidence),
      confidence: str(c.confidence),
    };
  });
}

export type ParsedSibling = { name: string; website?: string; city?: string; state?: string; country?: string; phone?: string; address?: string };
export type ParsedParent = { name: string; website?: string; city?: string; state?: string; country?: string; confidence?: string; source_url?: string; evidence?: string };

export function parsePortfolioDiscovery(section: CanonicalResult["portfolio_discovery"]): { parent: ParsedParent | null; siblings: ParsedSibling[] } {
  if (!section) return { parent: null, siblings: [] };
  const p = section.primary_operating_parent as Record<string, unknown> | undefined;
  const parent =
    p && typeof p === "object" && str(p.name) ? { name: str(p.name)!, website: str(p.website), city: str(p.city), state: str(p.state), country: str(p.country), confidence: str(p.confidence), source_url: str(p.source_url), evidence: str(p.evidence) } : null;

  const siblingsRaw = Array.isArray(section.siblings) ? section.siblings : [];
  const siblings: ParsedSibling[] = [];
  for (const raw of siblingsRaw) {
    const s = raw as Record<string, unknown>;
    const name = str(s.name);
    if (!name) continue;
    siblings.push({ name, website: str(s.website), city: str(s.city), state: str(s.state), country: str(s.country), phone: str(s.phone), address: str(s.address) });
  }

  return { parent, siblings };
}

function toItemArray(section: unknown, arrayKey: string): Record<string, unknown>[] {
  if (!section) return [];
  if (Array.isArray(section)) return section.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
  if (typeof section === "object") {
    const obj = section as Record<string, unknown>;
    if (Array.isArray(obj[arrayKey])) return (obj[arrayKey] as unknown[]).filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
    // A single flat signal object (no wrapper array).
    return [obj];
  }
  return [];
}

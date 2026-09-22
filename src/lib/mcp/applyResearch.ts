import type { Client } from "pg";
import { COMPANY_SIGNAL_TYPES } from "@/lib/companies/constants";
import { matchEnum } from "@/lib/companies/matching";
import { findCandidatesViaPg, type Candidate } from "./matching";
import {
  isBlankFact,
  mergeFact,
  parseContacts,
  parseHiringSignals,
  parseIdentity,
  parseOwnership,
  parsePainSignals,
  parsePortfolioDiscovery,
  parseProfile,
  parseQualification,
  parseReputation,
  parseSalesSignals,
  parseSystemOutput,
  type CanonicalResult,
} from "./canonicalResult";
import { deriveEvidenceTags, suggestOffers } from "./offerMapping";

const RATING_CHANNELS = ["google", "booking_com", "expedia", "hotels_com", "tripadvisor", "vrbo", "airbnb", "other"] as const;

export class ApplyResearchError extends Error {
  constructor(
    public code: "company_not_found" | "invalid_input",
    message: string
  ) {
    super(message);
  }
}

async function picklist(client: Client, fieldName: string): Promise<string[]> {
  const { rows } = await client.query<{ value: string }>(
    "SELECT value FROM picklist_values WHERE field_name = $1 AND is_active ORDER BY sort_order",
    [fieldName]
  );
  return rows.map((r) => r.value);
}

type CompanyRow = {
  id: number;
  name: string;
  website: string | null;
  phone: string | null;
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  company_type: string;
  lead_status: string;
  lifecycle_stage: string;
  parent_company_id: number | null;
  portfolio_size: number | null;
  ownership_entity: string | null;
  operating_entity: string | null;
  management_entity: string | null;
  brand_name: string | null;
  primary_operating_parent: string | null;
  primary_parent_reason: string | null;
};

export type ApplyResponse = {
  status: "applied" | "needs_review";
  company_id: number;
  idempotency_key: string;
  company_fields_updated: string[];
  ratings_created_or_updated: string[];
  pain_signals_created_or_updated: string[];
  hiring_signals_created_or_updated: string[];
  sales_signals_created_or_updated: string[];
  contacts_created: number[];
  contacts_updated: number[];
  parent: { action: "reused" | "created" | "unchanged" | "conflict_needs_review" | "ambiguous_needs_review" | "not_researched"; company_id: number | null };
  siblings: { created: { company_id: number; name: string }[]; reused: { company_id: number; name: string }[]; review_required: { name: string; reason: string }[] };
  outcome: { lead_status: string | null; lifecycle_stage: string | null };
  offers: { primary_offer: string | null; secondary_offers: string[] };
  warnings: string[];
  audit_event_id: number;
};

export async function applyResearchResult(
  client: Client,
  args: { companyId: number; canonicalResult: CanonicalResult; idempotencyKey: string; actorName: string; auditEventId: number }
): Promise<ApplyResponse> {
  const warnings: string[] = [];

  // Row-lock the target company for the duration of this transaction: two different
  // idempotency keys both targeting the same company_id must not interleave their writes.
  const { rows: companyRows } = await client.query<CompanyRow>(
    `SELECT id, name, website, phone, address_line_1, city, state, zip, country, company_type,
            lead_status, lifecycle_stage, parent_company_id, portfolio_size, ownership_entity,
            operating_entity, management_entity, brand_name, primary_operating_parent, primary_parent_reason
     FROM companies WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
    [args.companyId]
  );
  const company = companyRows[0];
  if (!company) throw new ApplyResearchError("company_not_found", `Company ${args.companyId} not found`);

  const { rows: propertyRows } =
    company.company_type === "Property"
      ? await client.query(
          "SELECT id, property_type, property_class, rooms_units, portfolio_role FROM property_details WHERE company_id = $1 FOR UPDATE",
          [args.companyId]
        )
      : { rows: [] as { id: number; property_type: string | null; property_class: string | null; rooms_units: number | null; portfolio_role: string | null }[] };
  const property = propertyRows[0] ?? null;

  const [companyTypes, propertyTypes, propertyClasses, portfolioRoles, prospectTiers] = await Promise.all([
    picklist(client, "company_type"),
    picklist(client, "property_type"),
    picklist(client, "property_class"),
    picklist(client, "portfolio_role"),
    picklist(client, "prospect_tier"),
  ]);

  // ---- 1. Parse every section up front ----
  const profile = parseProfile(args.canonicalResult.property_profile);
  const ownership = parseOwnership(args.canonicalResult.ownership);
  const identity = parseIdentity(args.canonicalResult.identity);
  const qualification = parseQualification(args.canonicalResult.qualification, args.canonicalResult.system_output);
  const systemOutput = parseSystemOutput(args.canonicalResult.system_output);
  const { ratings, warnings: reputationWarnings } = parseReputation(args.canonicalResult.reputation, RATING_CHANNELS);
  const { signals: painSignals, warnings: painWarnings } = parsePainSignals(
    args.canonicalResult.pain,
    ["Calls", "Reservations", "After-hours", "Check-in / Access", "OTA Messaging", "WhatsApp", "Guest Requests", "Front Desk Staffing", "Reviews", "Other"]
  );
  const hiringSignals = parseHiringSignals(args.canonicalResult.hiring_signal);
  const { signals: salesSignals, warnings: salesSignalWarnings } = parseSalesSignals(args.canonicalResult.system_output, COMPANY_SIGNAL_TYPES);
  const contacts = parseContacts(args.canonicalResult.contacts);
  const { parent: parentFacts, siblings: siblingFacts } = parsePortfolioDiscovery(args.canonicalResult.portfolio_discovery);
  warnings.push(...reputationWarnings, ...painWarnings, ...salesSignalWarnings);

  // ---- 2. Merge company-level profile + relationship facts (fill blanks only) ----
  const companyFieldsUpdated: string[] = [];
  const companyUpdate: Record<string, unknown> = {};
  const mergeInto = (field: string, existing: unknown, incoming: string | undefined) => {
    const { value, changed } = mergeFact(existing as string | null, incoming);
    if (changed) {
      companyUpdate[field] = value;
      companyFieldsUpdated.push(field);
    }
  };

  mergeInto("website", company.website, profile.website);
  mergeInto("phone", company.phone, profile.phone);
  mergeInto("address_line_1", company.address_line_1, profile.address_line_1);
  mergeInto("city", company.city, profile.city);
  mergeInto("state", company.state, profile.state);
  mergeInto("zip", company.zip, profile.zip);
  mergeInto("country", company.country, profile.country);
  mergeInto("ownership_entity", company.ownership_entity, ownership.ownership_entity);
  mergeInto("operating_entity", company.operating_entity, ownership.operating_entity);
  mergeInto("management_entity", company.management_entity, ownership.management_entity);
  mergeInto("brand_name", company.brand_name, ownership.brand_name);
  mergeInto("primary_operating_parent", company.primary_operating_parent, ownership.primary_operating_parent);
  mergeInto("primary_parent_reason", company.primary_parent_reason, ownership.primary_parent_reason);

  // Portfolio size is a fact about a GROUP company, not a Property -- only merge it here when
  // this record IS the group (never write it onto a Property row).
  if (company.company_type !== "Property") {
    const confirmedSize = (args.canonicalResult.portfolio_discovery as Record<string, unknown> | undefined)?.confirmed_size;
    if (typeof confirmedSize === "number") mergeInto("portfolio_size", company.portfolio_size, String(confirmedSize));
  }

  // Property-scoped fields, picklist-validated -- an unrecognized value is dropped with a
  // warning rather than blocking the whole write.
  const propertyUpdate: Record<string, unknown> = {};
  const propertyFieldsUpdated: string[] = [];
  if (property) {
    const mergePropertyPicklist = (field: string, existing: string | null, incoming: string | undefined, allowed: string[]) => {
      if (isBlankFact(incoming) || !isBlankFact(existing)) return; // fill-blanks-only, same rule as company facts
      const matched = matchEnum(incoming, allowed, null);
      if (!matched) {
        warnings.push(`property_profile.${field}: "${incoming}" is not a known ${field} value -- left unset. Allowed: ${allowed.join(", ")}`);
        return;
      }
      propertyUpdate[field] = matched;
      propertyFieldsUpdated.push(field);
    };
    mergePropertyPicklist("property_type", property.property_type, profile.property_type, propertyTypes);
    mergePropertyPicklist("property_class", property.property_class, profile.property_class, propertyClasses);
    mergePropertyPicklist("portfolio_role", property.portfolio_role, profile.portfolio_role, portfolioRoles);
    if (isBlankFact(property.rooms_units as unknown) && profile.rooms_units !== undefined) {
      propertyUpdate.rooms_units = profile.rooms_units;
      propertyFieldsUpdated.push("rooms_units");
    }
  } else if (profile.property_type || profile.property_class || profile.rooms_units || profile.portfolio_role) {
    warnings.push("property_profile fields were provided but this company has no property_details row (not a Property) -- ignored.");
  }
  companyFieldsUpdated.push(...propertyFieldsUpdated.map((f) => `propertyDetails.${f}`));

  if (profile.company_type) {
    const matched = matchEnum(profile.company_type, companyTypes, null);
    if (!matched) warnings.push(`property_profile.company_type: "${profile.company_type}" is not a known company_type -- ignored (never changes the record's fundamental type from a research pass).`);
    else if (matched !== company.company_type) warnings.push(`property_profile.company_type suggests "${matched}" but the record is "${company.company_type}" -- not changed automatically; review manually.`);
  }

  // ---- 3. Research metadata: always refreshed with THIS run's findings (not "facts to
  // preserve" -- they represent the current state of research), but never blanked by an
  // omitted field. last_researched is server-set, never trusted from the payload. ----
  if (identity.status !== undefined) { companyUpdate.identity_status = identity.status; companyFieldsUpdated.push("identity_status"); }
  if (identity.confidence !== undefined) { companyUpdate.identity_confidence = identity.confidence; companyFieldsUpdated.push("identity_confidence"); }
  if (identity.notes !== undefined) { companyUpdate.identity_notes = identity.notes; companyFieldsUpdated.push("identity_notes"); }
  if (systemOutput.confidence_notes !== undefined) { companyUpdate.confidence_notes = systemOutput.confidence_notes; companyFieldsUpdated.push("confidence_notes"); }
  if (qualification.research_complete !== undefined) { companyUpdate.research_complete = qualification.research_complete; companyFieldsUpdated.push("research_complete"); }
  if (qualification.reason !== undefined) { companyUpdate.qualification_summary = qualification.reason; companyFieldsUpdated.push("qualification_summary"); }
  if (qualification.why_now_hook !== undefined) { companyUpdate.sdr_signal_summary = qualification.why_now_hook; companyFieldsUpdated.push("sdr_signal_summary"); }
  if (qualification.priority_tier !== undefined) {
    const matched = matchEnum(qualification.priority_tier, prospectTiers, null);
    if (!matched) warnings.push(`qualification.priority_tier: "${qualification.priority_tier}" is not a known prospect_tier -- ignored. Allowed: ${prospectTiers.join(", ")}`);
    else { companyUpdate.prospect_tier = matched; companyFieldsUpdated.push("prospect_tier"); }
  }
  companyUpdate.last_researched = new Date().toISOString();
  companyFieldsUpdated.push("last_researched");

  // ---- 4. Qualification -> lead_status/lifecycle_stage. The incomplete-research rule runs
  // BEFORE the outcome rule, per spec. ----
  let leadStatus: string | null = null;
  let lifecycleStage: string | null = null;
  if (qualification.research_complete === false) {
    leadStatus = "Needs Review";
  } else if (qualification.outcome) {
    const outcome = qualification.outcome.trim().toLowerCase();
    if (outcome === "qualified") { leadStatus = "Qualified"; lifecycleStage = "Sales Qualified"; }
    else if (outcome === "needs review" || outcome === "needs_review") leadStatus = "Needs Review";
    else if (outcome === "disqualified" || outcome === "disqualify") leadStatus = "DisQualified";
    else warnings.push(`qualification.outcome "${qualification.outcome}" is not Qualified/Needs Review/Disqualified -- lead_status left unchanged.`);
  }
  if (leadStatus) { companyUpdate.lead_status = leadStatus; companyFieldsUpdated.push("lead_status"); }
  if (lifecycleStage) { companyUpdate.lifecycle_stage = lifecycleStage; companyFieldsUpdated.push("lifecycle_stage"); }

  // Never create deals/opportunities/customers/outreach activity from research (explicit rule):
  // lifecycle_stage is only ever set here to 'Sales Qualified', nothing further along the
  // pipeline, and no activity/outreach row is written by this function.

  let needsHumanReview = qualification.needs_human_review === true || qualification.research_complete === false;

  // ---- 5. Reputation: upsert by (company_id, channel). Ratings are current-state, always
  // refreshed with the new value when one is provided. Anything beyond rating/review_count
  // (native scale, listing URL, notes, confidence) isn't stored here -- it's already preserved
  // verbatim in mcp_audit_log's stored request for this call. ----
  const ratingsTouched: string[] = [];
  for (const r of ratings) {
    await client.query(
      `INSERT INTO company_ratings (company_id, channel, rating, review_count, captured_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (company_id, channel) DO UPDATE SET
         rating = COALESCE(EXCLUDED.rating, company_ratings.rating),
         review_count = COALESCE(EXCLUDED.review_count, company_ratings.review_count),
         captured_at = now(), updated_at = now()`,
      [args.companyId, r.channel, r.rating ?? null, r.review_count ?? null]
    );
    ratingsTouched.push(r.channel);
  }

  // ---- 6. Pain signals: dedupe by pain_type for this property; source_url fills blanks the
  // same way profile facts do. ----
  const painTouched: string[] = [];
  if (painSignals.length && !property) {
    warnings.push("pain signals were provided but this company has no property profile (not a Property) -- ignored.");
  } else if (property) {
    const { rows: existingPain } = await client.query<{ id: number; pain_type: string; source_url: string | null }>(
      "SELECT id, pain_type, source_url FROM property_pain_signals WHERE property_id = $1",
      [property.id]
    );
    for (const p of painSignals) {
      const existing = existingPain.find((e) => e.pain_type === p.pain_type);
      if (existing) {
        const sourceUrl = mergeFact(existing.source_url, p.source_url).value;
        await client.query("UPDATE property_pain_signals SET source_url=$2, detected_at=CURRENT_DATE WHERE id=$1", [existing.id, sourceUrl]);
      } else {
        await client.query(
          "INSERT INTO property_pain_signals (property_id, pain_type, source_url, detected_at) VALUES ($1,$2,$3,CURRENT_DATE)",
          [property.id, p.pain_type, p.source_url ?? null]
        );
      }
      painTouched.push(p.pain_type);
    }
  }

  // ---- 7. Hiring signals: dedupe by role. ----
  const hiringTouched: string[] = [];
  const validHiringRoles = await picklist(client, "hiring_signal_role");
  const validStrengths = await picklist(client, "strength");
  for (const h of hiringSignals) {
    const role = h.role ? matchEnum(h.role, validHiringRoles, null) : null;
    if (h.role && !role) warnings.push(`hiring_signal.role "${h.role}" is not a known role -- recorded without a role.`);
    const { rows: existingHiring } = await client.query<{ id: number; source_url: string | null }>(
      "SELECT id, source_url FROM company_hiring_signals WHERE company_id = $1 AND role IS NOT DISTINCT FROM $2",
      [args.companyId, role]
    );
    const existing = existingHiring[0];
    const strength = matchEnum(h.strength, validStrengths, null);
    if (existing) {
      const sourceUrl = mergeFact(existing.source_url, h.source_url).value;
      await client.query("UPDATE company_hiring_signals SET job_title=COALESCE($2,job_title), strength=COALESCE($3,strength), source_url=$4, detected_at=CURRENT_DATE WHERE id=$1", [
        existing.id, h.job_title ?? null, strength, sourceUrl,
      ]);
    } else {
      await client.query(
        "INSERT INTO company_hiring_signals (company_id, role, job_title, strength, source_url, detected_at) VALUES ($1,$2,$3,$4,$5,CURRENT_DATE)",
        [args.companyId, role, h.job_title ?? null, strength, h.source_url ?? null]
      );
    }
    hiringTouched.push(role ?? h.job_title ?? "unspecified role");
  }

  // ---- 7b. Other sales signals: dedupe by signal_type. ----
  const salesSignalsTouched: string[] = [];
  for (const s of salesSignals) {
    const strength = matchEnum(s.strength, validStrengths, null);
    const { rows: existingSales } = await client.query<{ id: number; source_url: string | null }>(
      "SELECT id, source_url FROM company_signals WHERE company_id = $1 AND signal_type = $2",
      [args.companyId, s.signal_type]
    );
    const existing = existingSales[0];
    if (existing) {
      const sourceUrl = mergeFact(existing.source_url, s.source_url).value;
      await client.query("UPDATE company_signals SET strength=COALESCE($2,strength), source_url=$3, detected_at=CURRENT_DATE WHERE id=$1", [existing.id, strength, sourceUrl]);
    } else {
      await client.query(
        "INSERT INTO company_signals (company_id, signal_type, strength, source_url, detected_at) VALUES ($1,$2,$3,$4,CURRENT_DATE)",
        [args.companyId, s.signal_type, strength, s.source_url ?? null]
      );
    }
    salesSignalsTouched.push(s.signal_type);
  }

  // ---- 8. Contacts ----
  const contactsCreated: number[] = [];
  const contactsUpdated: number[] = [];
  const validContactRoles = await picklist(client, "contact_role");
  const validDecisionMakerLevels = await picklist(client, "decision_maker_level");
  const ambiguousContacts: string[] = [];

  for (const c of contacts) {
    if (!c.first_name) { warnings.push("a contact entry had no name -- skipped (a named individual is required)."); continue; }
    if (!c.email) { warnings.push(`contact "${c.first_name} ${c.last_name ?? ""}".trim() had no email -- skipped (a verified email is required, never a generic inbox).`); continue; }
    if (c.email_verified === false) { warnings.push(`contact "${c.first_name}" <${c.email}> was marked unverified -- skipped.`); continue; }
    if (!c.source_url && !c.evidence) { warnings.push(`contact "${c.first_name}" <${c.email}> had no source_url or evidence -- skipped.`); continue; }
    if (/^(info|admin|contact|reservations?|sales|frontdesk|front-desk|hello|hi|support)@/i.test(c.email)) {
      warnings.push(`contact "${c.first_name}" <${c.email}> looks like a generic inbox, not a named individual -- skipped.`);
      continue;
    }

    const email = c.email.trim().toLowerCase();
    const { rows: owners } = await client.query("SELECT DISTINCT contact_id FROM contact_emails WHERE email = $1", [email]);
    if (owners.length > 1) {
      ambiguousContacts.push(email);
      warnings.push(`email ${email} belongs to more than one existing contact -- needs a manual merge, skipped.`);
      continue;
    }

    const role = c.contact_role ? matchEnum(c.contact_role, validContactRoles, null) : null;
    const dmLevel = c.decision_maker_level ? matchEnum(c.decision_maker_level, validDecisionMakerLevels, null) : null;

    let contactId: number;
    if (owners.length === 1) {
      contactId = Number(owners[0].contact_id);
      const { rows: existingContactRows } = await client.query("SELECT last_name, linkedin_url FROM contacts WHERE id = $1", [contactId]);
      const existingContact = existingContactRows[0];
      const lastName = mergeFact(existingContact?.last_name ?? null, c.last_name).value;
      const linkedin = mergeFact(existingContact?.linkedin_url ?? null, c.linkedin_url).value;
      await client.query("UPDATE contacts SET last_name = $2, linkedin_url = $3 WHERE id = $1", [contactId, lastName, linkedin]);
      contactsUpdated.push(contactId);
    } else {
      const { rows: created } = await client.query(
        "INSERT INTO contacts (first_name, last_name, linkedin_url) VALUES ($1,$2,$3) RETURNING id",
        [c.first_name, c.last_name ?? null, c.linkedin_url ?? null]
      );
      contactId = Number(created[0].id);
      contactsCreated.push(contactId);
    }

    // Company link: never overwrite a human-entered or verified link; fill blanks otherwise.
    const { rows: linkRows } = await client.query(
      "SELECT is_verified, added_by_type, job_title, contact_role, decision_maker_level, is_primary FROM contact_companies WHERE contact_id = $1 AND company_id = $2",
      [contactId, args.companyId]
    );
    const link = linkRows[0];
    if (!link) {
      const { rows: anyPrimary } = await client.query("SELECT 1 FROM contact_companies WHERE contact_id = $1 AND is_primary", [contactId]);
      await client.query(
        `INSERT INTO contact_companies (contact_id, company_id, job_title, contact_role, decision_maker_level, is_primary, source_url, evidence, added_by_type, added_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'agent',$9)`,
        [contactId, args.companyId, c.job_title ?? null, role, dmLevel, anyPrimary.length === 0, c.source_url ?? null, c.evidence ?? null, args.actorName]
      );
    } else {
      const canOverwrite = link.added_by_type === "agent" && !link.is_verified;
      const patch: Record<string, unknown> = {};
      for (const [field, incoming] of [["job_title", c.job_title], ["contact_role", role], ["decision_maker_level", dmLevel]] as const) {
        if (!incoming) continue;
        if (canOverwrite || isBlankFact(link[field as keyof typeof link])) patch[field] = incoming;
      }
      if (Object.keys(patch).length) {
        const keys = Object.keys(patch);
        await client.query(
          `UPDATE contact_companies SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")} WHERE contact_id = $1 AND company_id = $2`,
          [contactId, args.companyId, ...keys.map((k) => patch[k])]
        );
      }
    }

    // Email/phone: add-only, never edit or remove an existing one.
    const { rows: hasEmail } = await client.query("SELECT 1 FROM contact_emails WHERE contact_id = $1 AND email = $2", [contactId, email]);
    if (hasEmail.length === 0) {
      const { rows: anyPrimaryEmail } = await client.query("SELECT 1 FROM contact_emails WHERE contact_id = $1 AND is_primary", [contactId]);
      await client.query(
        `INSERT INTO contact_emails (contact_id, email, label, company_id, is_primary, source_url, evidence, added_by_type, added_by_name)
         VALUES ($1,$2,'Work',$3,$4,$5,$6,'agent',$7)`,
        [contactId, email, args.companyId, anyPrimaryEmail.length === 0, c.source_url ?? null, c.evidence ?? null, args.actorName]
      );
    }
    if (c.phone) {
      const { rows: hasPhone } = await client.query("SELECT 1 FROM contact_phones WHERE contact_id = $1 AND phone = $2", [contactId, c.phone]);
      if (hasPhone.length === 0) {
        const { rows: anyPrimaryPhone } = await client.query("SELECT 1 FROM contact_phones WHERE contact_id = $1 AND is_primary", [contactId]);
        await client.query(
          `INSERT INTO contact_phones (contact_id, phone, label, company_id, is_primary, source_url, evidence, added_by_type, added_by_name)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'agent',$8)`,
          [contactId, c.phone, c.phone_type ?? "Work", args.companyId, anyPrimaryPhone.length === 0, c.source_url ?? null, c.evidence ?? null, args.actorName]
        );
      }
    }
  }
  if (ambiguousContacts.length) needsHumanReview = true;

  // ---- 9. Parent / siblings ----
  let parentAction: ApplyResponse["parent"]["action"] = "not_researched";
  let resolvedParentId: number | null = company.parent_company_id;
  const siblingsCreated: { company_id: number; name: string }[] = [];
  const siblingsReused: { company_id: number; name: string }[] = [];
  const siblingsReview: { name: string; reason: string }[] = [];

  if (parentFacts) {
    if (company.parent_company_id) {
      // Already has a parent -- only "reused" if it's the SAME one; otherwise this is exactly
      // the "existing company with a different parent" case: do not overwrite, flag for review.
      const candidates = await findCandidatesViaPg(client, { name: parentFacts.name, website: parentFacts.website, city: parentFacts.city, country: parentFacts.country });
      const matchesExisting = candidates.find((c) => c.company_id === company.parent_company_id && c.match_confidence !== "Low");
      if (matchesExisting) {
        parentAction = "unchanged";
      } else {
        parentAction = "conflict_needs_review";
        needsHumanReview = true;
        warnings.push(`portfolio_discovery found a possible parent ("${parentFacts.name}") but this company already has a different parent -- not changed.`);
      }
    } else {
      const candidates = await findCandidatesViaPg(client, { name: parentFacts.name, website: parentFacts.website, city: parentFacts.city, country: parentFacts.country });
      const strong = candidates.filter((c) => c.match_confidence !== "Low");
      if (strong.length > 1) {
        parentAction = "ambiguous_needs_review";
        needsHumanReview = true;
        warnings.push(`portfolio_discovery.primary_operating_parent "${parentFacts.name}" matches more than one existing company -- not linked, needs manual review.`);
      } else {
        const parentId = strong[0]
          ? strong[0].company_id
          : Number(
              (
                await client.query(
                  `INSERT INTO companies (name, website, city, country, company_type, lifecycle_stage, lead_status, source)
                   VALUES ($1,$2,$3,$4,'Hotel Group / Portfolio','Lead','New','codex_research') RETURNING id`,
                  [parentFacts.name, parentFacts.website ?? null, parentFacts.city ?? null, parentFacts.country ?? null]
                )
              ).rows[0].id
            );
        parentAction = strong[0] ? "reused" : "created";
        resolvedParentId = parentId;
        companyUpdate.parent_company_id = parentId;
        companyFieldsUpdated.push("parent_company_id");
        if (property && isBlankFact(property.portfolio_role) || property?.portfolio_role === "Independent") {
          propertyUpdate.portfolio_role = "Portfolio Property";
          if (!propertyFieldsUpdated.includes("portfolio_role")) companyFieldsUpdated.push("propertyDetails.portfolio_role");
        }
      }
    }
  }

  // Siblings only make sense once a parent exists (either just resolved, or already present).
  if (siblingFacts.length && !resolvedParentId) {
    for (const s of siblingFacts) siblingsReview.push({ name: s.name, reason: "no confirmed parent to attach this sibling to" });
  } else if (resolvedParentId) {
    for (const s of siblingFacts) {
      const candidates = await findCandidatesViaPg(client, { name: s.name, website: s.website, city: s.city, country: s.country, phone: s.phone, address: s.address });
      const strong = candidates.filter((c) => c.match_confidence !== "Low");
      if (strong.length > 1) {
        siblingsReview.push({ name: s.name, reason: "ambiguous match against multiple existing companies" });
        continue;
      }
      if (strong[0]) {
        const existingParent = strong[0].parent_company_id;
        if (existingParent === resolvedParentId) {
          siblingsReused.push({ company_id: strong[0].company_id, name: strong[0].name });
        } else if (!existingParent) {
          await client.query("UPDATE companies SET parent_company_id = $2 WHERE id = $1", [strong[0].company_id, resolvedParentId]);
          await client.query("UPDATE property_details SET portfolio_role = 'Portfolio Property' WHERE company_id = $1 AND portfolio_role IN ('Independent')", [strong[0].company_id]);
          siblingsReused.push({ company_id: strong[0].company_id, name: strong[0].name });
        } else {
          siblingsReview.push({ name: s.name, reason: `existing record (company ${strong[0].company_id}) has a different parent -- not changed` });
        }
        continue;
      }
      const { rows: createdSibling } = await client.query(
        `INSERT INTO companies (name, website, city, state, country, phone, address_line_1, company_type, lifecycle_stage, lead_status, source, parent_company_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'Property','Lead','New','codex_research',$8) RETURNING id`,
        [s.name, s.website ?? null, s.city ?? null, s.state ?? null, s.country ?? null, s.phone ?? null, s.address ?? null, resolvedParentId]
      );
      const siblingId = Number(createdSibling[0].id);
      await client.query("INSERT INTO property_details (company_id, portfolio_role) VALUES ($1, 'Portfolio Property')", [siblingId]);
      siblingsCreated.push({ company_id: siblingId, name: s.name });
      // Explicitly one-hop only: this creates a bare sibling record for the runner to research
      // next; it never calls back into research/apply_research_result for the sibling itself.
    }
  }

  // ---- 10. Offers: auto-suggest only for a clean Qualified outcome; never invent a value
  // outside the real offer_service picklist. No human-vs-research provenance is tracked on this
  // row (explicit decision) -- a research pass may freely replace an existing Primary/Secondary
  // Offer, including one a human set. mapping_version is folded into the rationale text since
  // there's no dedicated column for it. ----
  const offerOptions = await picklist(client, "offer_service");
  let primaryOffer: string | null = null;
  const secondaryOffers: string[] = [];
  const eligibleForOffers = leadStatus === "Qualified" && qualification.research_complete !== false && !needsHumanReview;

  if (eligibleForOffers) {
    const tags = deriveEvidenceTags({
      painTypes: painTouched,
      hiringRoles: hiringTouched,
      isPortfolio: Boolean(resolvedParentId),
      siblingCount: siblingsCreated.length + siblingsReused.length,
    });
    const suggestion = suggestOffers(tags, offerOptions);
    const rationale = (tags: string[]) => `Auto-suggested (mapping ${suggestion.version}) from research evidence: ${tags.join(", ")}`;

    if (suggestion.primary) {
      // A different service can't become the new Primary while the old Primary row still
      // exists: (company_id, service) is unique and at most one row per company may be
      // type='Primary' -- clear the old one first if it's changing.
      const { rows: existingPrimary } = await client.query<{ service: string }>("SELECT service FROM offer_recommendations WHERE company_id = $1 AND type = 'Primary'", [args.companyId]);
      if (existingPrimary[0] && existingPrimary[0].service !== suggestion.primary) {
        await client.query("DELETE FROM offer_recommendations WHERE company_id = $1 AND type = 'Primary'", [args.companyId]);
      }
      await client.query(
        `INSERT INTO offer_recommendations (company_id, service, type, rationale)
         VALUES ($1,$2,'Primary',$3)
         ON CONFLICT (company_id, service) DO UPDATE SET type = 'Primary', rationale = EXCLUDED.rationale, updated_at = now()`,
        [args.companyId, suggestion.primary, rationale(suggestion.tags)]
      );
      primaryOffer = suggestion.primary;
    }
    for (const secondary of suggestion.secondary) {
      await client.query(
        `INSERT INTO offer_recommendations (company_id, service, type, rationale)
         VALUES ($1,$2,'Secondary',$3)
         ON CONFLICT (company_id, service) DO UPDATE SET rationale = EXCLUDED.rationale, updated_at = now()`,
        [args.companyId, secondary, rationale(suggestion.tags)]
      );
      secondaryOffers.push(secondary);
    }
  }

  companyUpdate.needs_human_review = needsHumanReview;
  if (!companyFieldsUpdated.includes("needs_human_review")) companyFieldsUpdated.push("needs_human_review");

  // ---- 11. Apply the accumulated company/property updates ----
  if (Object.keys(companyUpdate).length) {
    const keys = Object.keys(companyUpdate);
    await client.query(
      `UPDATE companies SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE id = $1`,
      [args.companyId, ...keys.map((k) => companyUpdate[k])]
    );
  }
  if (property && Object.keys(propertyUpdate).length) {
    const keys = Object.keys(propertyUpdate);
    await client.query(
      `UPDATE property_details SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")}, updated_at = now() WHERE company_id = $1`,
      [args.companyId, ...keys.map((k) => propertyUpdate[k])]
    );
  }

  const anyWriteHappened =
    companyFieldsUpdated.filter((f) => f !== "last_researched" && f !== "needs_human_review").length > 0 ||
    ratingsTouched.length > 0 ||
    painTouched.length > 0 ||
    hiringTouched.length > 0 ||
    salesSignalsTouched.length > 0 ||
    contactsCreated.length > 0 ||
    contactsUpdated.length > 0 ||
    siblingsCreated.length > 0 ||
    parentAction === "created" ||
    parentAction === "reused";

  const status: ApplyResponse["status"] = !anyWriteHappened && (parentAction === "conflict_needs_review" || parentAction === "ambiguous_needs_review" || ambiguousContacts.length > 0) ? "needs_review" : "applied";

  return {
    status,
    company_id: args.companyId,
    idempotency_key: args.idempotencyKey,
    company_fields_updated: companyFieldsUpdated,
    ratings_created_or_updated: ratingsTouched,
    pain_signals_created_or_updated: painTouched,
    hiring_signals_created_or_updated: hiringTouched,
    sales_signals_created_or_updated: salesSignalsTouched,
    contacts_created: contactsCreated,
    contacts_updated: contactsUpdated,
    parent: { action: parentAction, company_id: resolvedParentId },
    siblings: { created: siblingsCreated, reused: siblingsReused, review_required: siblingsReview },
    outcome: { lead_status: leadStatus ?? company.lead_status, lifecycle_stage: lifecycleStage ?? company.lifecycle_stage },
    offers: { primary_offer: primaryOffer, secondary_offers: secondaryOffers },
    warnings,
    audit_event_id: args.auditEventId,
  };
}

export type { Candidate };

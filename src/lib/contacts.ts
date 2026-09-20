import type { SupabaseClient } from "@supabase/supabase-js";
import { matchEnum } from "@/lib/companies/matching";
import { fetchPicklistValues } from "@/lib/picklists";

// Who is writing. Agent (Codex) writes are always stored unverified with provenance;
// is_verified is a human confirmation only.
export type Actor = { type: "human" | "agent"; name: string; userId?: number | null };

type Provenance = { source_url?: string | null; evidence?: string | null };

export type CompanyLinkInput = Provenance & {
  company_id: number | string;
  job_title?: string | null;
  contact_role?: string | null;
  decision_maker_level?: string | null;
  is_verified?: boolean;
};
export type EmailInput = Provenance & {
  email: string;
  label?: string | null;
  company_id?: number | string | null;
  is_verified?: boolean;
};
export type PhoneInput = Provenance & {
  phone: string;
  label?: string | null;
  company_id?: number | string | null;
  is_verified?: boolean;
};

export type ContactPayload = {
  first_name?: string;
  last_name?: string | null;
  linkedin_url?: string | null;
  contact_line_type?: string | null;
  companies?: CompanyLinkInput[];
  emails?: EmailInput[];
  phones?: PhoneInput[];
};

export type NormalizedLink = {
  company_id: number;
  job_title: string | null;
  contact_role: string | null;
  decision_maker_level: string | null;
  is_verified: boolean;
  source_url: string | null;
  evidence: string | null;
};
export type NormalizedChannel = {
  value: string;
  label: string | null;
  company_id: number | null;
  is_verified: boolean;
  source_url: string | null;
  evidence: string | null;
};

export const normalizeEmail = (email: string | null | undefined) => {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
};

const phoneKey = (phone: string) => phone.replace(/[^\d+]/g, "");
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const text = (v: unknown) => (v === undefined || v === null ? null : String(v).trim() || null);
const toId = (v: unknown) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export type NormalizedContact = {
  person: Record<string, string | null>;
  companies?: NormalizedLink[];
  emails?: NormalizedChannel[];
  phones?: NormalizedChannel[];
  error?: string;
  warnings: string[];
};

// Validates and normalizes a contact payload. Person fields are returned only when present
// (safe for partial updates). companies/emails/phones are returned only when provided and
// represent the FULL desired set. Picklist values must match the admin lists; in lenient mode
// (research agent) an unrecognized value is dropped with a warning instead of failing.
export async function normalizeContactPayload(
  supabase: SupabaseClient,
  input: ContactPayload,
  { lenient = false }: { lenient?: boolean } = {}
): Promise<NormalizedContact> {
  const warnings: string[] = [];
  const fail = (error: string): NormalizedContact => ({ person: {}, error, warnings });

  const [roles, levels, lineTypes, emailLabels, phoneLabels] = await Promise.all([
    fetchPicklistValues(supabase, "contact_role"),
    fetchPicklistValues(supabase, "decision_maker_level"),
    fetchPicklistValues(supabase, "contact_line_type"),
    fetchPicklistValues(supabase, "email_label"),
    fetchPicklistValues(supabase, "phone_label"),
  ]);

  const pick = (raw: unknown, allowed: string[], name: string): { value: string | null; error?: string } => {
    const value = text(raw);
    if (!value) return { value: null };
    const match = matchEnum(value, allowed, null);
    if (match) return { value: match };
    const message = `Invalid ${name} "${value}". Allowed: ${allowed.join(", ")}`;
    if (!lenient) return { value: null, error: message };
    warnings.push(`${message} -- ignored`);
    return { value: null };
  };

  const person: Record<string, string | null> = {};
  for (const key of ["first_name", "last_name", "linkedin_url"] as const) {
    if (input[key] !== undefined) person[key] = text(input[key]);
  }
  if (input.contact_line_type !== undefined) {
    const r = pick(input.contact_line_type, lineTypes, "contact_line_type");
    if (r.error) return fail(r.error);
    person.contact_line_type = r.value;
  }

  const result: NormalizedContact = { person, warnings };

  if (input.companies !== undefined) {
    const links: NormalizedLink[] = [];
    for (const item of input.companies) {
      const companyId = toId(item.company_id);
      if (!companyId) return fail("Each company link needs a valid company_id");
      const role = pick(item.contact_role, roles, "contact_role");
      const level = pick(item.decision_maker_level, levels, "decision_maker_level");
      if (role.error || level.error) return fail((role.error || level.error)!);
      links.push({
        company_id: companyId,
        job_title: text(item.job_title),
        contact_role: role.value,
        decision_maker_level: level.value,
        is_verified: Boolean(item.is_verified),
        source_url: text(item.source_url),
        evidence: text(item.evidence),
      });
    }
    result.companies = dedupe(links, (l) => String(l.company_id));
  }

  const channels = (
    items: (EmailInput | PhoneInput)[],
    kind: "email" | "phone",
    labels: string[]
  ): NormalizedChannel[] | string => {
    const out: NormalizedChannel[] = [];
    for (const item of items) {
      const value = kind === "email" ? normalizeEmail((item as EmailInput).email) : text((item as PhoneInput).phone);
      if (!value) continue; // blank rows from the form are ignored
      if (kind === "email" && !EMAIL_PATTERN.test(value)) return `Invalid email address: ${value}`;
      const label = pick(item.label, labels, `${kind} label`);
      if (label.error) return label.error;
      out.push({
        value,
        label: label.value,
        company_id: toId(item.company_id),
        is_verified: Boolean(item.is_verified),
        source_url: text(item.source_url),
        evidence: text(item.evidence),
      });
    }
    return dedupe(out, (c) => (kind === "email" ? c.value : phoneKey(c.value)));
  };

  if (input.emails !== undefined) {
    const r = channels(input.emails, "email", emailLabels);
    if (typeof r === "string") return fail(r);
    result.emails = r;
  }
  if (input.phones !== undefined) {
    const r = channels(input.phones, "phone", phoneLabels);
    if (typeof r === "string") return fail(r);
    result.phones = r;
  }

  return result;
}

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function isDuplicateEmailError(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

export async function findMissingCompanies(supabase: SupabaseClient, companyIds: number[]) {
  if (companyIds.length === 0) return [];
  const { data } = await supabase.from("companies").select("id").in("id", companyIds).is("deleted_at", null);
  const found = new Set((data ?? []).map((c) => Number(c.id)));
  return companyIds.filter((id) => !found.has(id));
}

// Existing (live) contacts owning any of these emails. Emails are stored lower-cased.
export async function findContactsByEmails(supabase: SupabaseClient, emails: string[]) {
  if (emails.length === 0) return [] as { contact_id: number; email: string }[];
  const { data } = await supabase.from("contact_emails").select("contact_id, email").in("email", emails);
  return (data ?? []).map((r) => ({ contact_id: Number(r.contact_id), email: r.email as string }));
}

// Column changes for a row being verified/unverified. Only a human can verify.
function verificationColumns(isVerified: boolean, actor: Actor) {
  if (actor.type !== "human" || !isVerified) {
    return { is_verified: false, verified_at: null, verified_by: null };
  }
  return { is_verified: true, verified_at: new Date().toISOString(), verified_by: actor.userId ?? null };
}

const provenanceColumns = (source_url: string | null, evidence: string | null, actor: Actor) => ({
  source_url,
  evidence,
  added_by_type: actor.type,
  added_by_name: actor.name,
});

// ---- Replace-set sync (used by the app: the form sends the full desired state) ----

// Replaces a contact's company links. The first link becomes the primary company. Existing
// rows keep their provenance; verification only changes when a human flips the flag.
export async function syncCompanyLinks(
  supabase: SupabaseClient,
  contactId: number,
  links: NormalizedLink[],
  actor: Actor
) {
  const { data: existing, error: readError } = await supabase
    .from("contact_companies")
    .select("company_id, is_verified")
    .eq("contact_id", contactId);
  if (readError) return readError;
  const existingMap = new Map((existing ?? []).map((r) => [Number(r.company_id), r]));

  const { error: deleteError } = await supabase
    .from("contact_companies")
    .delete()
    .eq("contact_id", contactId)
    .not("company_id", "in", `(${links.map((l) => l.company_id).join(",")})`);
  if (deleteError) return deleteError;

  // Clear the primary flag first: only one row per contact may be primary at a time.
  const { error: clearError } = await supabase
    .from("contact_companies")
    .update({ is_primary: false })
    .eq("contact_id", contactId);
  if (clearError) return clearError;

  for (const [index, link] of links.entries()) {
    const base = {
      job_title: link.job_title,
      contact_role: link.contact_role,
      decision_maker_level: link.decision_maker_level,
      is_primary: index === 0,
    };
    const row = existingMap.get(link.company_id);
    const { error } = row
      ? await supabase
          .from("contact_companies")
          .update({
            ...base,
            ...(actor.type === "human" && link.is_verified !== row.is_verified
              ? verificationColumns(link.is_verified, actor)
              : {}),
          })
          .eq("contact_id", contactId)
          .eq("company_id", link.company_id)
      : await supabase.from("contact_companies").insert({
          contact_id: contactId,
          company_id: link.company_id,
          ...base,
          ...verificationColumns(link.is_verified, actor),
          ...provenanceColumns(link.source_url, link.evidence, actor),
        });
    if (error) return error;
  }
  return null;
}

type ChannelTable = "contact_emails" | "contact_phones";
const channelSpec = {
  contact_emails: { column: "email", key: (v: string) => v.toLowerCase() },
  contact_phones: { column: "phone", key: phoneKey },
} as const;

// Replaces a contact's emails or phones. The first entry becomes the primary one.
export async function syncChannels(
  supabase: SupabaseClient,
  table: ChannelTable,
  contactId: number,
  items: NormalizedChannel[],
  actor: Actor
) {
  const { column, key } = channelSpec[table];
  const { data: existing, error: readError } = await supabase
    .from(table)
    .select(`id, ${column}, is_verified`)
    .eq("contact_id", contactId);
  if (readError) return readError;

  const rows = (existing ?? []) as unknown as Record<string, unknown>[];
  const byKey = new Map(rows.map((r) => [key(String(r[column])), r]));
  const keep = new Set(items.map((i) => key(i.value)));

  const removeIds = rows.filter((r) => !keep.has(key(String(r[column])))).map((r) => r.id as number);
  if (removeIds.length) {
    const { error } = await supabase.from(table).delete().in("id", removeIds);
    if (error) return error;
  }

  const { error: clearError } = await supabase.from(table).update({ is_primary: false }).eq("contact_id", contactId);
  if (clearError) return clearError;

  for (const [index, item] of items.entries()) {
    const row = byKey.get(key(item.value));
    const base = { label: item.label, company_id: item.company_id, is_primary: index === 0 };
    const { error } = row
      ? await supabase
          .from(table)
          .update({
            [column]: item.value,
            ...base,
            updated_at: new Date().toISOString(),
            ...(actor.type === "human" && item.is_verified !== row.is_verified
              ? verificationColumns(item.is_verified, actor)
              : {}),
          })
          .eq("id", row.id as number)
      : await supabase.from(table).insert({
          contact_id: contactId,
          [column]: item.value,
          ...base,
          ...verificationColumns(item.is_verified, actor),
          ...provenanceColumns(item.source_url, item.evidence, actor),
        });
    if (error) return error;
  }
  return null;
}

// ---- Add-only helpers (used by the agent and by "link an existing person") ----

// Adds a company link, or updates the existing one without clobbering trusted data: a human
// can overwrite anything; an agent may only overwrite its own unverified values -- otherwise
// it just fills blanks.
export async function addCompanyLink(
  supabase: SupabaseClient,
  contactId: number,
  link: NormalizedLink,
  actor: Actor
): Promise<{ added: boolean; updatedFields: string[]; error: { message: string } | null }> {
  const { data: rows } = await supabase
    .from("contact_companies")
    .select("company_id, is_primary, is_verified, added_by_type, job_title, contact_role, decision_maker_level")
    .eq("contact_id", contactId);
  const current = rows?.find((r) => Number(r.company_id) === link.company_id);

  if (!current) {
    const { error } = await supabase.from("contact_companies").insert({
      contact_id: contactId,
      company_id: link.company_id,
      job_title: link.job_title,
      contact_role: link.contact_role,
      decision_maker_level: link.decision_maker_level,
      is_primary: !rows?.some((r) => r.is_primary),
      ...verificationColumns(link.is_verified, actor),
      ...provenanceColumns(link.source_url, link.evidence, actor),
    });
    return { added: !error, updatedFields: [], error };
  }

  const overwrite = actor.type === "human" || (!current.is_verified && current.added_by_type === "agent");
  const patch: Record<string, string | null> = {};
  for (const field of ["job_title", "contact_role", "decision_maker_level"] as const) {
    if (link[field] && (overwrite || !current[field]) && link[field] !== current[field]) patch[field] = link[field];
  }
  if (Object.keys(patch).length === 0) return { added: false, updatedFields: [], error: null };

  const { error } = await supabase
    .from("contact_companies")
    .update(patch)
    .eq("contact_id", contactId)
    .eq("company_id", link.company_id);
  return { added: false, updatedFields: Object.keys(patch), error };
}

// Adds emails/phones the contact doesn't already have; never removes or edits existing ones.
export async function addChannels(
  supabase: SupabaseClient,
  table: ChannelTable,
  contactId: number,
  items: NormalizedChannel[],
  actor: Actor
): Promise<{ added: string[]; existing: string[]; error: { message: string } | null }> {
  const { column, key } = channelSpec[table];
  const { data } = await supabase.from(table).select(`${column}, is_primary`).eq("contact_id", contactId);
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const have = new Set(rows.map((r) => key(String(r[column]))));
  let needsPrimary = !rows.some((r) => r.is_primary);

  const added: string[] = [];
  const existing: string[] = [];
  for (const item of items) {
    if (have.has(key(item.value))) {
      existing.push(item.value);
      continue;
    }
    const { error } = await supabase.from(table).insert({
      contact_id: contactId,
      [column]: item.value,
      label: item.label,
      company_id: item.company_id,
      is_primary: needsPrimary,
      ...verificationColumns(item.is_verified, actor),
      ...provenanceColumns(item.source_url, item.evidence, actor),
    });
    if (error) return { added, existing, error };
    needsPrimary = false;
    have.add(key(item.value));
    added.push(item.value);
  }
  return { added, existing, error: null };
}

// Soft delete. The person's emails are released so the address can be used again.
export async function softDeleteContact(supabase: SupabaseClient, contactId: number) {
  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", contactId);
  if (error) return error;
  const { error: releaseError } = await supabase.from("contact_emails").delete().eq("contact_id", contactId);
  return releaseError;
}

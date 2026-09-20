import type { SupabaseClient } from "@supabase/supabase-js";
import { matchEnum } from "@/lib/companies/matching";
import { fetchPicklistValues } from "@/lib/picklists";

export type ContactInput = {
  first_name?: string;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  contact_role?: string | null;
  decision_maker_level?: string | null;
  contact_line_type?: string | null;
  linkedin_url?: string | null;
};

const PICKLIST_FIELDS = [
  ["contact_role", "contact_role"],
  ["decision_maker_level", "decision_maker_level"],
  ["contact_line_type", "contact_line_type"],
] as const;

export const normalizeEmail = (email: string | null | undefined) => {
  const trimmed = email?.trim().toLowerCase();
  return trimmed ? trimmed : null;
};

// Validates and normalizes contact fields. In lenient mode an unrecognized picklist value is
// dropped with a warning instead of failing. Only fields present on `input` are returned, so
// the result is safe to use for partial updates (an omitted field never blanks stored data).
// Empty strings become null; picklist values must match the admin-managed lists.
export async function normalizeContactInput(
  supabase: SupabaseClient,
  input: ContactInput,
  { lenient = false }: { lenient?: boolean } = {}
): Promise<{ fields: Record<string, string | null>; error?: string; warnings: string[] }> {
  const fields: Record<string, string | null> = {};
  const warnings: string[] = [];

  for (const key of ["first_name", "last_name", "phone", "job_title", "linkedin_url"] as const) {
    if (input[key] !== undefined) fields[key] = input[key]?.toString().trim() || null;
  }
  if (input.email !== undefined) fields.email = normalizeEmail(input.email);

  for (const [key, picklist] of PICKLIST_FIELDS) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (!raw) {
      fields[key] = null;
      continue;
    }
    const allowed = await fetchPicklistValues(supabase, picklist);
    const match = matchEnum(raw, allowed, null);
    if (!match) {
      const message = `Invalid ${key} "${raw}". Allowed: ${allowed.join(", ")}`;
      // lenient (research agent): keep the contact, drop just the unrecognized value.
      if (!lenient) return { fields, error: message, warnings };
      warnings.push(`${message} -- ignored`);
      continue;
    }
    fields[key] = match;
  }

  return { fields, warnings };
}

export function isDuplicateEmailError(error: { code?: string } | null) {
  return error?.code === "23505";
}

// Parses a list of company ids from a request body, de-duplicated, order preserved
// (the first id is the contact's primary company).
export function parseCompanyIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const ids = value.map((v) => parseInt(String(v), 10)).filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}

export async function findMissingCompanies(supabase: SupabaseClient, companyIds: number[]) {
  const { data } = await supabase.from("companies").select("id").in("id", companyIds).is("deleted_at", null);
  const found = new Set((data ?? []).map((c) => Number(c.id)));
  return companyIds.filter((id) => !found.has(id));
}

// Replaces a contact's company set. The first id becomes the primary company.
export async function setContactCompanies(supabase: SupabaseClient, contactId: number, companyIds: number[]) {
  const { error: deleteError } = await supabase
    .from("contact_companies")
    .delete()
    .eq("contact_id", contactId)
    .not("company_id", "in", `(${companyIds.join(",")})`);
  if (deleteError) return deleteError;

  // Clear the primary flag first: only one row per contact may be primary at a time.
  const { error: clearError } = await supabase
    .from("contact_companies")
    .update({ is_primary: false })
    .eq("contact_id", contactId);
  if (clearError) return clearError;

  const { error } = await supabase.from("contact_companies").upsert(
    companyIds.map((company_id, index) => ({ contact_id: contactId, company_id, is_primary: index === 0 })),
    { onConflict: "contact_id,company_id" }
  );
  return error;
}

// Adds one association without touching the others. Becomes primary only if the contact has none.
export async function addContactToCompany(supabase: SupabaseClient, contactId: number, companyId: number) {
  const { data: existing } = await supabase
    .from("contact_companies")
    .select("company_id, is_primary")
    .eq("contact_id", contactId);

  if (existing?.some((row) => Number(row.company_id) === companyId)) return { added: false, error: null };

  const { error } = await supabase.from("contact_companies").insert({
    contact_id: contactId,
    company_id: companyId,
    is_primary: !existing?.some((row) => row.is_primary),
  });
  return { added: !error, error };
}

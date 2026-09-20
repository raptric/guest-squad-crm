import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addContactToCompany,
  findMissingCompanies,
  isDuplicateEmailError,
  normalizeContactInput,
  normalizeEmail,
  setContactCompanies,
} from "@/lib/contacts";

// Creates a contact associated with the given companies (first = primary).
// linkExisting: if the email already belongs to a contact, associate that contact with the
// company instead of failing (used by the "Add Contact" form on a company page).
export async function createContactForCompanies(
  supabase: SupabaseClient,
  companyIds: number[],
  body: Record<string, unknown>,
  { linkExisting = false }: { linkExisting?: boolean } = {}
) {
  if (companyIds.length === 0) {
    return NextResponse.json({ error: "Select at least one company for this contact" }, { status: 400 });
  }
  if (!String(body.first_name ?? "").trim()) {
    return NextResponse.json({ error: "First name is required" }, { status: 400 });
  }

  const missing = await findMissingCompanies(supabase, companyIds);
  if (missing.length) return NextResponse.json({ error: `Company not found: ${missing.join(", ")}` }, { status: 404 });

  if (linkExisting) {
    const email = normalizeEmail(body.email as string | undefined);
    const { data: existing } = email
      ? await supabase.from("contacts").select("id").eq("email", email).is("deleted_at", null).maybeSingle()
      : { data: null };
    if (existing) {
      for (const companyId of companyIds) {
        const { error } = await addContactToCompany(supabase, Number(existing.id), companyId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ id: existing.id, linked_existing: true });
    }
  }

  const { fields, error: validationError } = await normalizeContactInput(supabase, body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { data, error } = await supabase.from("contacts").insert(fields).select().single();

  if (isDuplicateEmailError(error)) {
    return NextResponse.json({ error: "A contact with this email already exists" }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const linkError = await setContactCompanies(supabase, Number(data.id), companyIds);
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  return NextResponse.json({ contact: data, id: data.id }, { status: 201 });
}

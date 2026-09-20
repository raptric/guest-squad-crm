import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  findContactsByEmails,
  findMissingCompanies,
  isDuplicateEmailError,
  normalizeContactPayload,
  softDeleteContact,
  syncChannels,
  syncCompanyLinks,
} from "@/lib/contacts";
import { getHumanActor } from "../actor";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Partial update. Person fields apply when present; companies / emails / phones, when present,
// replace that contact's full set (the first entry is primary).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contactId = Number(id);
  const supabase = await createClient();
  const actor = await getHumanActor(supabase);
  if (!actor) return fail("Unauthorized", 401);

  const body = await request.json();
  if (body.first_name !== undefined && !String(body.first_name).trim()) return fail("First name is required", 400);
  if (body.companies !== undefined && !body.companies.length) {
    return fail("A contact must belong to at least one company", 400);
  }

  const normalized = await normalizeContactPayload(supabase, body);
  if (normalized.error) return fail(normalized.error, 400);

  if (normalized.companies) {
    const missing = await findMissingCompanies(supabase, normalized.companies.map((l) => l.company_id));
    if (missing.length) return fail(`Company not found: ${missing.join(", ")}`, 404);
  }
  if (normalized.emails) {
    const owners = await findContactsByEmails(supabase, normalized.emails.map((e) => e.value));
    if (owners.some((o) => o.contact_id !== contactId)) return fail("A contact with this email already exists", 409);
  }

  const { data: contact, error } = await supabase
    .from("contacts")
    .update(Object.keys(normalized.person).length ? normalized.person : { updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!contact) return fail("Contact not found", 404);

  const syncError =
    (normalized.companies && (await syncCompanyLinks(supabase, contactId, normalized.companies, actor))) ||
    (normalized.emails && (await syncChannels(supabase, "contact_emails", contactId, normalized.emails, actor))) ||
    (normalized.phones && (await syncChannels(supabase, "contact_phones", contactId, normalized.phones, actor)));
  if (syncError) {
    return isDuplicateEmailError(syncError) ? fail("A contact with this email already exists", 409) : fail(syncError.message, 500);
  }

  return NextResponse.json({ id: contactId });
}

// Soft delete -- the row is kept but hidden everywhere, and its emails are released for reuse.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  if (!(await getHumanActor(supabase))) return fail("Unauthorized", 401);

  const error = await softDeleteContact(supabase, Number(id));
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}

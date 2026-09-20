import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addCompanyLink,
  findContactsByEmails,
  findMissingCompanies,
  isDuplicateEmailError,
  normalizeContactPayload,
  syncChannels,
  syncCompanyLinks,
  type Actor,
  type ContactPayload,
} from "@/lib/contacts";

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ error, ...extra }, { status });

// Creates a contact with its company links (first = primary), emails and phones.
// linkExisting: if one of the emails already belongs to a contact, associate THAT contact with
// the company instead of failing (the "Add Contact" form on a company page).
export async function createContact(
  supabase: SupabaseClient,
  body: ContactPayload,
  actor: Actor,
  { linkExisting = false }: { linkExisting?: boolean } = {}
) {
  if (!body.companies?.length) return fail("Select at least one company for this contact", 400);
  if (!String(body.first_name ?? "").trim()) return fail("First name is required", 400);

  const normalized = await normalizeContactPayload(supabase, body);
  if (normalized.error) return fail(normalized.error, 400);
  const links = normalized.companies!;

  const missing = await findMissingCompanies(supabase, links.map((l) => l.company_id));
  if (missing.length) return fail(`Company not found: ${missing.join(", ")}`, 404);

  const owners = await findContactsByEmails(supabase, (normalized.emails ?? []).map((e) => e.value));
  if (owners.length) {
    if (!linkExisting) {
      return fail("A contact with this email already exists", 409, { existing_contact_id: owners[0].contact_id });
    }
    const existingId = owners[0].contact_id;
    for (const link of links) {
      const r = await addCompanyLink(supabase, existingId, link, actor);
      if (r.error) return fail(r.error.message, 500);
    }
    return NextResponse.json({ id: existingId, linked_existing: true });
  }

  const { data: contact, error } = await supabase.from("contacts").insert(normalized.person).select("id").single();
  if (error || !contact) return fail(error?.message ?? "Failed to create contact", 500);
  const contactId = Number(contact.id);

  const syncError =
    (await syncCompanyLinks(supabase, contactId, links, actor)) ||
    (await syncChannels(supabase, "contact_emails", contactId, normalized.emails ?? [], actor)) ||
    (await syncChannels(supabase, "contact_phones", contactId, normalized.phones ?? [], actor));

  if (syncError) {
    // Don't leave a half-built contact behind.
    await supabase.from("contacts").delete().eq("id", contactId);
    return isDuplicateEmailError(syncError)
      ? fail("A contact with this email already exists", 409)
      : fail(syncError.message, 500);
  }

  return NextResponse.json({ id: contactId }, { status: 201 });
}

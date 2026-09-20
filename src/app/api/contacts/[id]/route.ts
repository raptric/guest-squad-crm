import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  findMissingCompanies,
  isDuplicateEmailError,
  normalizeContactInput,
  parseCompanyIds,
  setContactCompanies,
} from "@/lib/contacts";

async function authorize() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await authorize();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  if (body.first_name !== undefined && !String(body.first_name).trim()) {
    return NextResponse.json({ error: "First name is required" }, { status: 400 });
  }

  const { fields, error: validationError } = await normalizeContactInput(supabase, body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  let companyIds: number[] | null = null;
  if (body.company_ids !== undefined) {
    companyIds = parseCompanyIds(body.company_ids);
    if (companyIds.length === 0) {
      return NextResponse.json({ error: "A contact must belong to at least one company" }, { status: 400 });
    }
    const missing = await findMissingCompanies(supabase, companyIds);
    if (missing.length) return NextResponse.json({ error: `Company not found: ${missing.join(", ")}` }, { status: 404 });
  }

  // An update with no contact fields (e.g. only company_ids) still needs the existence check.
  const query = Object.keys(fields).length
    ? supabase.from("contacts").update(fields)
    : supabase.from("contacts").update({ updated_at: new Date().toISOString() });
  const { data, error } = await query.eq("id", id).is("deleted_at", null).select("id").maybeSingle();

  if (isDuplicateEmailError(error)) {
    return NextResponse.json({ error: "A contact with this email already exists" }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  if (companyIds) {
    const linkError = await setContactCompanies(supabase, Number(id), companyIds);
    if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

// Soft delete -- the row (and its activity history) is kept, but hidden everywhere.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await authorize();
  if (!supabase) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

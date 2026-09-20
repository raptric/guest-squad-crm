import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDuplicateEmailError, normalizeContactInput } from "@/lib/contacts";

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

  const update: Record<string, string | number | null> = { ...fields };
  if (body.company_id !== undefined) {
    const companyId = parseInt(String(body.company_id), 10);
    if (!companyId) return NextResponse.json({ error: "Select a company for this contact" }, { status: 400 });
    update.company_id = companyId;
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(update)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (isDuplicateEmailError(error)) {
    return NextResponse.json({ error: "A contact with this email already exists" }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

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

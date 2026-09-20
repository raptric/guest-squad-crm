import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDuplicateEmailError, normalizeContactInput } from "@/lib/contacts";

export async function createContactForCompany(
  supabase: SupabaseClient,
  companyId: number,
  body: Record<string, unknown>
) {
  if (!String(body.first_name ?? "").trim()) {
    return NextResponse.json({ error: "First name is required" }, { status: 400 });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .is("deleted_at", null)
    .single();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const { fields, error: validationError } = await normalizeContactInput(supabase, body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...fields, company_id: companyId })
    .select()
    .single();

  if (isDuplicateEmailError(error)) {
    return NextResponse.json({ error: "A contact with this email already exists" }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ contact: data, id: data.id }, { status: 201 });
}

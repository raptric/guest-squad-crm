import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCompanyFields, parsePropertyDetailsFields } from "../shared";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const fields = parseCompanyFields(body);

  if (!fields.name || !fields.company_type) {
    return NextResponse.json({ error: "name and company_type are required" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("companies")
    .select("company_type")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const { error } = await supabase.from("companies").update(fields).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const wasProperty = existing.company_type === "Property";
  const isNowProperty = fields.company_type === "Property";

  if (isNowProperty) {
    // Upsert: covers both "still a Property" (update) and "just became one" (insert).
    const { error: detailsError } = await supabase
      .from("property_details")
      .upsert(
        { company_id: Number(id), ...parsePropertyDetailsFields(body) },
        { onConflict: "company_id" }
      );

    if (detailsError) {
      return NextResponse.json({ error: detailsError.message }, { status: 500 });
    }
  } else if (wasProperty) {
    // No longer a Property -- its property_details row is no longer valid to keep.
    const { error: deleteError } = await supabase
      .from("property_details")
      .delete()
      .eq("company_id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: Number(id) });
}

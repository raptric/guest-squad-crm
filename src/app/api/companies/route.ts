import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCompanyFields, parsePropertyDetailsFields } from "./shared";

export async function POST(request: Request) {
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

  const { data: company, error } = await supabase
    .from("companies")
    .insert({ ...fields, source: "manual" })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (fields.company_type === "Property") {
    const { error: detailsError } = await supabase.from("property_details").insert({
      company_id: company.id,
      ...parsePropertyDetailsFields(body),
    });

    if (detailsError) {
      return NextResponse.json({ error: detailsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: company.id }, { status: 201 });
}

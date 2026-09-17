import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, website, company_type, city, country, lifecycle_stage, lead_status } = body;

  if (!name || !company_type) {
    return NextResponse.json({ error: "name and company_type are required" }, { status: 400 });
  }

  const { data: company, error } = await supabase
    .from("companies")
    .insert({
      name,
      website: website || null,
      company_type,
      city: city || null,
      country: country || null,
      lifecycle_stage: lifecycle_stage || "Prospect",
      lead_status: lead_status || "New",
      source: "manual",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (company_type === "Property") {
    const { error: detailsError } = await supabase
      .from("property_details")
      .insert({ company_id: company.id });

    if (detailsError) {
      return NextResponse.json({ error: detailsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: company.id }, { status: 201 });
}

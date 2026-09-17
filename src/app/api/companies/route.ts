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
  const {
    name,
    website,
    company_type,
    parent_company_id,
    address_line_1,
    address_line_2,
    city,
    state,
    country,
    zip,
    phone,
    lifecycle_stage,
    lead_status,
    prospect_tier,
    qualification_summary,
    sdr_signal_summary,
    owner_id,
    // property_details (only used when company_type === "Property")
    property_type,
    property_class,
    rooms_units,
    portfolio_role,
    portfolio_size,
  } = body;

  if (!name || !company_type) {
    return NextResponse.json({ error: "name and company_type are required" }, { status: 400 });
  }

  const toIntOrNull = (value: unknown) =>
    value === undefined || value === null || value === "" ? null : parseInt(String(value), 10);

  const { data: company, error } = await supabase
    .from("companies")
    .insert({
      name,
      website: website || null,
      company_type,
      parent_company_id: toIntOrNull(parent_company_id),
      address_line_1: address_line_1 || null,
      address_line_2: address_line_2 || null,
      city: city || null,
      state: state || null,
      country: country || null,
      zip: zip || null,
      phone: phone || null,
      lifecycle_stage: lifecycle_stage || "Prospect",
      lead_status: lead_status || "New",
      prospect_tier: prospect_tier || null,
      qualification_summary: qualification_summary || null,
      sdr_signal_summary: sdr_signal_summary || null,
      owner_id: toIntOrNull(owner_id),
      // portfolio_size describes the group itself (Management Company, Hotel Group, etc.),
      // not a physical property, so it only applies to non-Property company types.
      portfolio_size: company_type !== "Property" ? toIntOrNull(portfolio_size) : null,
      source: "manual",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (company_type === "Property") {
    const { error: detailsError } = await supabase.from("property_details").insert({
      company_id: company.id,
      property_type: property_type || null,
      property_class: property_class || null,
      rooms_units: toIntOrNull(rooms_units),
      // No parent set means the property is standalone -- "Independent" is the accurate
      // default rather than leaving this null/unknown.
      portfolio_role: toIntOrNull(parent_company_id) ? portfolio_role || null : "Independent",
    });

    if (detailsError) {
      return NextResponse.json({ error: detailsError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ id: company.id }, { status: 201 });
}

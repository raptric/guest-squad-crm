import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pain_type, source_url } = await request.json();

  if (!pain_type) {
    return NextResponse.json({ error: "pain_type is required" }, { status: 400 });
  }

  const { data: propertyDetails } = await supabase
    .from("property_details")
    .select("id")
    .eq("company_id", id)
    .single();

  if (!propertyDetails) {
    return NextResponse.json(
      { error: "This company has no property profile -- pain signals only apply to Properties" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("property_pain_signals")
    .insert({
      property_id: propertyDetails.id,
      pain_type,
      source_url: source_url || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signal: data }, { status: 201 });
}

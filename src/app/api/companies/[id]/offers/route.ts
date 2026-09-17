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

  const { service, type, rationale } = await request.json();

  if (!service || !type) {
    return NextResponse.json({ error: "service and type are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("offer_recommendations")
    .insert({
      company_id: Number(id),
      service,
      type,
      rationale: rationale || null,
    })
    .select()
    .single();

  if (error) {
    // Partial unique index on (company_id) WHERE type = 'Primary', and UNIQUE(company_id, service).
    if (error.code === "23505") {
      const message = error.message.includes("one_primary")
        ? "This company already has a Primary recommendation. Remove it first before adding a new one."
        : "This service has already been recommended for this company.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ offer: data }, { status: 201 });
}

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

  const body = await request.json();
  const {
    first_name,
    last_name,
    email,
    phone,
    job_title,
    contact_role,
    decision_maker_level,
    contact_line_type,
    linkedin_url,
  } = body;

  if (!first_name) {
    return NextResponse.json({ error: "first_name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      company_id: Number(id),
      first_name,
      last_name: last_name || null,
      email: email || null,
      phone: phone || null,
      job_title: job_title || null,
      contact_role: contact_role || null,
      decision_maker_level: decision_maker_level || null,
      contact_line_type: contact_line_type || null,
      linkedin_url: linkedin_url || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contact: data }, { status: 201 });
}

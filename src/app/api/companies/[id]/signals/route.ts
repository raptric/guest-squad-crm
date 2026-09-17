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

  const { signal_type, strength, source_url } = await request.json();

  if (!signal_type) {
    return NextResponse.json({ error: "signal_type is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("company_signals")
    .insert({
      company_id: Number(id),
      signal_type,
      strength: strength || null,
      source_url: source_url || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ signal: data }, { status: 201 });
}

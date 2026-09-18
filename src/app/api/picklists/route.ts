import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { field_name, value } = await request.json();
  if (!field_name || !value) {
    return NextResponse.json({ error: "field_name and value are required" }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("picklist_values")
    .select("sort_order")
    .eq("field_name", field_name)
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextSortOrder = (existing?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("picklist_values")
    .insert({ field_name, value: value.trim(), sort_order: nextSortOrder })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This value already exists for this field" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ value: data }, { status: 201 });
}

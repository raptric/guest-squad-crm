import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseProfileInput } from "@/lib/profile-fields";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = parseProfileInput(await request.json());
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("users")
    .update(parsed.value)
    .eq("auth_user_id", user.id)
    .select("id, name, email, role, phone, job_title")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}

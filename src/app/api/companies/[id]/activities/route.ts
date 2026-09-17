import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { activity_type, body: activityBody } = await request.json();

  if (!activity_type) {
    return NextResponse.json({ error: "activity_type is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .insert({
      company_id: Number(id),
      activity_type,
      actor_type: "human",
      actor_name: currentUser.name,
      body: activityBody || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ activity: data }, { status: 201 });
}

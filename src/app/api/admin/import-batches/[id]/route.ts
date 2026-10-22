import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/current-user";

// Admin marks a campaign completed after checking it by hand. One-way: a completed campaign is
// never reopened (the scraper closes campaigns automatically via campaign_complete).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { status } = (await request.json()) as { status?: string };
  if (status !== "completed") {
    return NextResponse.json({ error: "Campaigns can only be marked completed; a completed campaign can't be reopened" }, { status: 400 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("import_batches")
    .update({ status: "completed", completed_at: new Date().toISOString(), completed_by: actor.id })
    .eq("id", id)
    .eq("status", "open")
    .select("id, status")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data) return NextResponse.json({ batch: data });

  // No open row matched: either it doesn't exist or it was already completed (nothing to change).
  const { data: existing } = await admin.from("import_batches").select("id, status").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  return NextResponse.json({ batch: existing });
}

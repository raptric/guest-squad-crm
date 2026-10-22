import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/current-user";

// Admin marks a batch completed (after checking it by hand) or reopens it.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { status } = (await request.json()) as { status?: string };
  if (status !== "open" && status !== "completed") {
    return NextResponse.json({ error: "status must be 'open' or 'completed'" }, { status: 400 });
  }

  const { id } = await params;
  const { data, error } = await createAdminClient()
    .from("import_batches")
    .update(
      status === "completed"
        ? { status, completed_at: new Date().toISOString(), completed_by: actor.id }
        : { status, completed_at: null, completed_by: null }
    )
    .eq("id", id)
    .select("id, status")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  return NextResponse.json({ batch: data });
}

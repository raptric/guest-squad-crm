import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/current-user";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Rename a team.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Forbidden", 403);

  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid team id");
  const raw = (await request.json()).name;
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) return fail("Team name is required");
  if (name.length > 100) return fail("Team name must be 100 characters or fewer");

  const { data, error } = await createAdminClient().from("teams").update({ name }).eq("id", id).select("id, name").maybeSingle();
  if (error) {
    return error.code === "23505" ? fail("A team with that name already exists.", 409) : fail(error.message, 500);
  }
  if (!data) return fail("Team not found", 404);
  return NextResponse.json({ team: data });
}

// Delete a team -- only when it has no members.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Forbidden", 403);

  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid team id");

  const admin = createAdminClient();
  const { count } = await admin.from("users").select("id", { count: "exact", head: true }).eq("team_id", id);
  if (count) {
    return fail(`This team still has ${count} member${count === 1 ? "" : "s"}. Move them to another team or remove them from it first.`);
  }

  const { error } = await admin.from("teams").delete().eq("id", id);
  if (error) return fail(error.message, 500);
  return NextResponse.json({ ok: true });
}

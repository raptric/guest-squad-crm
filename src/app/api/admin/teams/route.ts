import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/current-user";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Teams list with each team's lead and member count (admin only).
export async function GET() {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Forbidden", 403);

  const admin = createAdminClient();
  const [{ data: teams }, { data: members }] = await Promise.all([
    admin.from("teams").select("id, name").order("name"),
    admin.from("users").select("id, name, role, team_id").not("team_id", "is", null),
  ]);
  return NextResponse.json({
    teams: (teams ?? []).map((t) => ({
      ...t,
      member_count: (members ?? []).filter((m) => m.team_id === t.id).length,
      lead: (members ?? []).find((m) => m.team_id === t.id && m.role === "team_lead")?.name ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Forbidden", 403);

  const raw = (await request.json()).name;
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!name) return fail("Team name is required");
  if (name.length > 100) return fail("Team name must be 100 characters or fewer");

  const { data, error } = await createAdminClient().from("teams").insert({ name }).select("id, name").single();
  if (error) {
    return error.code === "23505" ? fail("A team with that name already exists.", 409) : fail(error.message, 500);
  }
  return NextResponse.json({ team: data }, { status: 201 });
}

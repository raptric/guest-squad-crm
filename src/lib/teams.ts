import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES, type Role } from "@/lib/roles";

// Validates a role + team combination against the team rules and returns what should be stored:
//   * admins belong to no team (any team given is dropped)
//   * a team lead must have a team, and a team can have only one lead
//   * a plain user may have a team or none
// The same rules are also enforced by database constraints; this gives clear error messages first.
export async function resolveRoleAndTeam(args: {
  role: unknown;
  teamId: unknown;
  userId?: number;
}): Promise<{ role: Role; team_id: number | null } | { error: string }> {
  const { role, userId } = args;
  if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) {
    return { error: "role must be 'user', 'team_lead' or 'super_admin'" };
  }
  if (role === "super_admin") return { role: role as Role, team_id: null };

  const rawTeam = args.teamId;
  const teamId = rawTeam === null || rawTeam === undefined || rawTeam === "" ? null : Number(rawTeam);
  if (teamId !== null && (!Number.isInteger(teamId) || teamId <= 0)) return { error: "Invalid team" };

  if (teamId === null) {
    if (role === "team_lead") return { error: "A Team Lead must belong to a team. Pick a team first." };
    return { role: role as Role, team_id: null };
  }

  const admin = createAdminClient();
  const { data: team } = await admin.from("teams").select("id, name").eq("id", teamId).maybeSingle();
  if (!team) return { error: "Team not found" };

  if (role === "team_lead") {
    let query = admin.from("users").select("id, name").eq("team_id", teamId).eq("role", "team_lead");
    if (userId !== undefined) query = query.neq("id", userId);
    const { data: existing } = await query.maybeSingle();
    if (existing) {
      return { error: `${team.name} already has a lead (${existing.name}). Change their role first.` };
    }
  }
  return { role: role as Role, team_id: teamId };
}

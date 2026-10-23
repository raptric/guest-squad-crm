import { query } from "@/lib/db";
import type { Actor } from "@/lib/assignment";

export type WorkloadPerson = {
  id: number;
  name: string;
  role: string;
  team_name: string | null;
  assigned: number;
  to_verify: number;
  ready: number;
};
export type WorkloadTeam = { id: number; name: string; total: number; pool: number };

// How the work is spread: companies per person (and how many still need verification), per team, and the
// pools waiting to be handed out. Admins see everyone; a team lead sees their own team.
export async function fetchWorkload(actor: Actor) {
  const isAdmin = actor.role === "super_admin";
  const teamParam = isAdmin ? [] : [actor.team_id];

  const [people, teams, [unassigned]] = await Promise.all([
    query<WorkloadPerson>(
      `SELECT u.id::int AS id, u.name, u.role, t.name AS team_name,
              count(c.id)::int AS assigned,
              count(c.id) FILTER (WHERE c.lead_status = 'Qualified' AND c.verification_status IS NULL)::int AS to_verify,
              count(c.id) FILTER (WHERE c.verification_status = 'Ready for Outreach')::int AS ready
         FROM users u
         LEFT JOIN teams t ON t.id = u.team_id
         LEFT JOIN companies c ON c.owner_id = u.id AND c.deleted_at IS NULL
        WHERE ${isAdmin ? "u.role <> 'super_admin'" : "u.team_id = $1"}
        GROUP BY u.id, u.name, u.role, t.name
        ORDER BY t.name NULLS LAST, u.name`,
      teamParam
    ),
    query<WorkloadTeam>(
      `SELECT t.id::int AS id, t.name, count(c.id)::int AS total, count(c.id) FILTER (WHERE c.owner_id IS NULL)::int AS pool
         FROM teams t LEFT JOIN companies c ON c.team_id = t.id AND c.deleted_at IS NULL
        ${isAdmin ? "" : "WHERE t.id = $1"}
        GROUP BY t.id, t.name ORDER BY t.name`,
      teamParam
    ),
    isAdmin
      ? query<{ n: number }>("SELECT count(*)::int AS n FROM companies WHERE deleted_at IS NULL AND team_id IS NULL AND owner_id IS NULL")
      : Promise.resolve([{ n: 0 }]),
  ]);
  return { people, teams, unassignedToTeam: unassigned.n };
}

// Count shown on the sidebar: for an admin, companies not yet given to any team; for a lead, their team's pool.
export async function fetchUnassignedBadge(actor: Actor): Promise<number> {
  if (actor.role === "super_admin") {
    const [r] = await query<{ n: number }>("SELECT count(*)::int AS n FROM companies WHERE deleted_at IS NULL AND team_id IS NULL AND owner_id IS NULL");
    return r.n;
  }
  if (actor.role === "team_lead" && actor.team_id) {
    const [r] = await query<{ n: number }>("SELECT count(*)::int AS n FROM companies WHERE deleted_at IS NULL AND team_id = $1 AND owner_id IS NULL", [actor.team_id]);
    return r.n;
  }
  return 0;
}

import { query } from "@/lib/db";

// Who may move companies, and the rules for it:
//   * Admin: any company -> any team or any person
//   * Team Lead: companies in their team (assigned to the team, or owned by a team member) -> people in their team
//   * User: cannot move companies
export type Actor = { id: number | string; role: string; team_id: number | string | null };

export const canAssign = (a: Actor | null | undefined): a is Actor =>
  !!a && (a.role === "super_admin" || (a.role === "team_lead" && a.team_id !== null && a.team_id !== undefined));

// SQL fragment limiting a query to a team lead's companies. `teamParam` is the placeholder holding their team id.
export const leadScopeSql = (teamParam: string) =>
  `(c.team_id = ${teamParam}::bigint OR c.owner_id IN (SELECT id FROM users WHERE team_id = ${teamParam}::bigint))`;

export type AssignableUser = { id: number; name: string; team_id: number | null };

// People the actor may assign companies to.
export async function assignableUsers(actor: Actor): Promise<AssignableUser[]> {
  if (!canAssign(actor)) return [];
  const rows =
    actor.role === "super_admin"
      ? await query<AssignableUser>("SELECT id::int AS id, name, team_id::int AS team_id FROM users ORDER BY name")
      : await query<AssignableUser>("SELECT id::int AS id, name, team_id::int AS team_id FROM users WHERE team_id = $1 ORDER BY name", [actor.team_id]);
  return rows;
}

// Sets (or clears) a single company's owner, applying the same rules as the bulk action.
// Assigning to a person also moves the company into that person's team; clearing the owner keeps the team.
export async function assignOwner(actor: Actor, companyId: number, userId: number | null): Promise<{ error: string } | { ok: true }> {
  if (!canAssign(actor)) return { error: "Only team leads and admins can reassign companies." };

  const [company] = await query<{ id: string; owner_id: string | null; team_id: string | null; in_scope: boolean }>(
    `SELECT c.id, c.owner_id, c.team_id,
            ${actor.role === "super_admin" ? "true" : leadScopeSql("$2")} AS in_scope
       FROM companies c WHERE c.id = $1 AND c.deleted_at IS NULL`,
    actor.role === "super_admin" ? [companyId] : [companyId, actor.team_id]
  );
  if (!company) return { error: "Company not found" };
  if (!company.in_scope) return { error: "That company isn't in your team." };

  if (userId === null) {
    await query("UPDATE companies SET owner_id = NULL WHERE id = $1", [companyId]);
    return { ok: true };
  }

  const [target] = await query<{ id: string; team_id: string | null }>("SELECT id, team_id FROM users WHERE id = $1", [userId]);
  if (!target) return { error: "Owner not found" };
  if (actor.role === "team_lead" && String(target.team_id) !== String(actor.team_id)) {
    return { error: "You can only assign companies to people in your team." };
  }
  await query("UPDATE companies SET owner_id = $1, team_id = $2 WHERE id = $3", [userId, target.team_id, companyId]);
  return { ok: true };
}

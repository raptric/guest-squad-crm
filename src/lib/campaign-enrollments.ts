import { query } from "@/lib/db";
import { leadScopeSql, type Actor } from "@/lib/assignment";
import { TODAY_SQL } from "@/lib/campaigns";

// The Enrollments view of one campaign. Every number and row is limited to the companies the viewer may see
// (and then to the scope they picked), so a user sees only their own companies, a lead their team's, an admin all.
export type Scope = "mine" | "team" | "all";
export type StatusFilter = "running" | "completed" | "stopped" | "all";

// Users only have "mine"; a lead has "mine" and "team" (default); an admin has "mine" and "all" (default).
export function normalizeScope(actor: Actor, requested: string | undefined): Scope {
  if (actor.role === "super_admin") return requested === "mine" ? "mine" : "all";
  if (actor.role === "team_lead" && actor.team_id !== null && actor.team_id !== undefined) return requested === "mine" ? "mine" : "team";
  return "mine";
}
export const scopesFor = (actor: Actor): Scope[] => (actor.role === "super_admin" ? ["all", "mine"] : actor.role === "team_lead" ? ["team", "mine"] : ["mine"]);

type Filters = { scope: Scope; ownerId: number | null; teamId: number | null };

// WHERE fragment on the company (alias c). `add` pushes a value and returns its placeholder.
function scopeSql(actor: Actor, f: Filters, add: (v: unknown) => string): string {
  const parts: string[] = [];
  if (f.scope === "mine") parts.push(`c.owner_id = ${add(actor.id)}::bigint`);
  else if (f.scope === "team" && actor.team_id !== null && actor.team_id !== undefined) parts.push(leadScopeSql(add(actor.team_id)));
  else if (actor.role !== "super_admin") parts.push(`c.owner_id = ${add(actor.id)}::bigint`); // never wider than the role allows
  // narrowing filters (people / teams), only for roles that have the people table
  if (f.ownerId !== null && actor.role !== "user") parts.push(`c.owner_id = ${add(f.ownerId)}::bigint`);
  if (f.teamId !== null && actor.role === "super_admin") parts.push(leadScopeSql(add(f.teamId)));
  return parts.length ? parts.join(" AND ") : "true";
}

const FROM = `
  FROM campaign_enrollments e
  JOIN campaigns k ON k.id = e.campaign_id
  JOIN companies c ON c.id = e.company_id AND c.deleted_at IS NULL
  LEFT JOIN users ou ON ou.id = c.owner_id`;

// Pending tasks of running enrollments that are past due (a paused campaign's tasks are on hold, never overdue).
const OVERDUE_COUNT = `(SELECT count(*) FROM campaign_tasks t WHERE t.enrollment_id = e.id AND e.status = 'active' AND k.status <> 'paused'
                          AND t.status = 'pending' AND t.due_date < ${TODAY_SQL})`;

export type Stats = { enrolled: number; running: number; completed: number; stopped: number; overdue: number };

export async function fetchStats(actor: Actor, campaignId: number, f: Filters): Promise<Stats> {
  const params: unknown[] = [campaignId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const [row] = await query<Stats>(
    `SELECT count(*)::int AS enrolled,
            count(*) FILTER (WHERE e.status = 'active')::int AS running,
            count(*) FILTER (WHERE e.status = 'completed')::int AS completed,
            count(*) FILTER (WHERE e.status = 'stopped')::int AS stopped,
            coalesce(sum(${OVERDUE_COUNT}), 0)::int AS overdue
       ${FROM} WHERE e.campaign_id = $1 AND ${scopeSql(actor, f, add)}`,
    params
  );
  return row;
}

export type PersonRow = { owner_id: string | null; name: string; team_name: string | null; enrolled: number; running: number; completed: number; stopped: number; overdue: number };

// One row per owner, within the selected scope (not narrowed by the owner / team filters, so you can pick from it).
export async function fetchPeople(actor: Actor, campaignId: number, scope: Scope): Promise<PersonRow[]> {
  if (actor.role === "user") return [];
  const params: unknown[] = [campaignId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  return query<PersonRow>(
    `SELECT c.owner_id::text AS owner_id, coalesce(ou.name, 'No owner') AS name, (SELECT t.name FROM teams t WHERE t.id = ou.team_id) AS team_name,
            count(*)::int AS enrolled,
            count(*) FILTER (WHERE e.status = 'active')::int AS running,
            count(*) FILTER (WHERE e.status = 'completed')::int AS completed,
            count(*) FILTER (WHERE e.status = 'stopped')::int AS stopped,
            coalesce(sum(${OVERDUE_COUNT}), 0)::int AS overdue
       ${FROM} WHERE e.campaign_id = $1 AND ${scopeSql(actor, { scope, ownerId: null, teamId: null }, add)}
      GROUP BY c.owner_id, ou.name, ou.team_id
      ORDER BY count(*) DESC, name`,
    params
  );
}

export type TeamRow = { team_id: string | null; name: string; enrolled: number; running: number; completed: number; stopped: number; overdue: number };

// Admins: the same numbers rolled up by team (a company's team, else its owner's).
export async function fetchTeams(actor: Actor, campaignId: number, scope: Scope): Promise<TeamRow[]> {
  if (actor.role !== "super_admin" || scope !== "all") return [];
  const params: unknown[] = [campaignId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  return query<TeamRow>(
    `SELECT tm.id::text AS team_id, coalesce(tm.name, 'No team') AS name,
            count(*)::int AS enrolled,
            count(*) FILTER (WHERE e.status = 'active')::int AS running,
            count(*) FILTER (WHERE e.status = 'completed')::int AS completed,
            count(*) FILTER (WHERE e.status = 'stopped')::int AS stopped,
            coalesce(sum(${OVERDUE_COUNT}), 0)::int AS overdue
       ${FROM}
       LEFT JOIN teams tm ON tm.id = coalesce(c.team_id, ou.team_id)
      WHERE e.campaign_id = $1 AND ${scopeSql(actor, { scope, ownerId: null, teamId: null }, add)}
      GROUP BY tm.id, tm.name
      ORDER BY count(*) DESC, name`,
    params
  );
}

export type TaskLine = { step_position: number; step_day: number; step_channel: string; step_title: string; due_date: string; status: string; completed_by_name: string | null; notes: string | null };
export type EnrollmentListRow = {
  id: string;
  company_id: string;
  company_name: string;
  recipient_label: string;
  owner_id: string | null;
  owner_name: string | null;
  enrolled_by_name: string | null;
  enrolled_at: Date;
  start_date: string;
  status: "active" | "completed" | "stopped";
  stop_note: string | null;
  fit_label: "strong" | "partial" | "weak" | null;
  campaign_status: string;
  steps_total: number;
  steps_done: number;
  overdue: number;
  next_title: string | null;
  next_channel: string | null;
  next_due: string | null;
  tasks: TaskLine[];
};

export async function fetchEnrollmentList(
  actor: Actor,
  campaignId: number,
  f: Filters,
  opts: { status: StatusFilter; fit: string | null; q: string; page: number; size: number }
): Promise<{ rows: EnrollmentListRow[]; total: number }> {
  const params: unknown[] = [campaignId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = [`e.campaign_id = $1`, scopeSql(actor, f, add)];
  if (opts.status === "running") where.push("e.status = 'active'");
  if (opts.status === "completed") where.push("e.status = 'completed'");
  if (opts.status === "stopped") where.push("e.status = 'stopped'");
  if (opts.fit) where.push(`e.fit_label = ${add(opts.fit)}`);
  if (opts.q) where.push(`c.name ILIKE ${add(`%${opts.q.replace(/[\\%_]/g, "\\$&")}%`)}`);
  const whereSql = where.join(" AND ");

  const [{ total }] = await query<{ total: number }>(`SELECT count(*)::int AS total ${FROM} WHERE ${whereSql}`, params);
  const listParams = [...params];
  const limit = `LIMIT $${listParams.push(opts.size)} OFFSET $${listParams.push((opts.page - 1) * opts.size)}`;
  const rows = await query<Omit<EnrollmentListRow, "tasks">>(
    `SELECT e.id::text AS id, c.id::text AS company_id, c.name AS company_name, e.recipient_label, c.owner_id::text AS owner_id, ou.name AS owner_name,
            (SELECT u.name FROM users u WHERE u.id = e.enrolled_by) AS enrolled_by_name, e.enrolled_at, to_char(e.start_date, 'YYYY-MM-DD') AS start_date,
            e.status, e.stop_note, e.fit_label, k.status AS campaign_status,
            (SELECT count(*)::int FROM campaign_tasks t WHERE t.enrollment_id = e.id) AS steps_total,
            (SELECT count(*)::int FROM campaign_tasks t WHERE t.enrollment_id = e.id AND t.status IN ('done', 'skipped')) AS steps_done,
            ${OVERDUE_COUNT}::int AS overdue,
            nx.step_title AS next_title, nx.step_channel AS next_channel, to_char(nx.due_date, 'YYYY-MM-DD') AS next_due
       ${FROM}
       LEFT JOIN LATERAL (SELECT t.step_title, t.step_channel, t.due_date FROM campaign_tasks t WHERE t.enrollment_id = e.id AND t.status = 'pending'
                           ORDER BY t.step_position LIMIT 1) nx ON e.status = 'active'
      WHERE ${whereSql}
      ORDER BY (e.status = 'active') DESC, nx.due_date ASC NULLS LAST, e.enrolled_at DESC
      ${limit}`,
    listParams
  );
  const tasks = rows.length
    ? await query<TaskLine & { enrollment_id: string }>(
        `SELECT t.enrollment_id::text AS enrollment_id, t.step_position, t.step_day, t.step_channel, t.step_title, to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.status,
                (SELECT u.name FROM users u WHERE u.id = t.completed_by) AS completed_by_name, t.notes
           FROM campaign_tasks t WHERE t.enrollment_id = ANY($1::bigint[]) ORDER BY t.enrollment_id, t.step_position`,
        [rows.map((r) => r.id)]
      )
    : [];
  return { rows: rows.map((r) => ({ ...r, tasks: tasks.filter((t) => t.enrollment_id === r.id) })), total };
}

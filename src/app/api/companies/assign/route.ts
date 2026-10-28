import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { query, withTransaction } from "@/lib/db";
import { canAssign, leadScopeSql } from "@/lib/assignment";
import { buildWhere, FROM } from "@/lib/companies/list-query";
import { parseFilters } from "@/lib/companies/list-filters";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

const ACTIONS = ["team", "user", "remove_owner", "remove_team"] as const;
type Action = (typeof ACTIONS)[number];
const MAX_IDS = 5000;

type Body = {
  dryRun?: boolean;
  action?: string;
  target_id?: number | string;
  mode?: string;
  selection?: { ids?: unknown; query?: unknown; excludeIds?: unknown };
};

const intList = (v: unknown) =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, MAX_IDS) : [];

// Bulk assign / unassign companies. The selection is either explicit ids, or "everything matching these
// filters" (optionally minus some ids) -- so choosing all 2,000 results is one request, not 2,000 ids.
//   action 'team'         admin only      -> company joins the team; its owner is cleared unless they're in that team
//   action 'user'         admin / lead    -> company goes to that person (and into their team)
//   action 'remove_owner' admin / lead    -> back to the team's pool (team kept)
//   action 'remove_team'  admin only      -> unassigned from both
// mode 'skip_assigned' leaves companies that already have an owner/team alone; 'reassign' overrides them.
// dryRun: true returns the counts for the confirmation dialog without changing anything.
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);
  if (!canAssign(actor)) return fail("Only team leads and admins can assign companies.", 403);
  const isAdmin = actor.role === "super_admin";

  const body = (await request.json()) as Body;
  const action = body.action as Action;
  if (!ACTIONS.includes(action)) return fail(`action must be one of: ${ACTIONS.join(", ")}`);
  if (!isAdmin && (action === "team" || action === "remove_team")) {
    return fail("Only admins can assign companies to a team or remove them from one.", 403);
  }
  const mode = body.mode === "reassign" ? "reassign" : "skip_assigned";

  // ----- target -----
  let targetId: number | null = null;
  let targetName: string | null = null;
  if (action === "team" || action === "user") {
    targetId = Number(body.target_id);
    if (!Number.isInteger(targetId) || targetId <= 0) return fail("Choose who to assign to.");
    if (action === "team") {
      const [team] = await query<{ id: string; name: string }>("SELECT id, name FROM teams WHERE id = $1", [targetId]);
      if (!team) return fail("Team not found", 404);
      targetName = team.name;
    } else {
      const [user] = await query<{ id: string; name: string; team_id: string | null }>("SELECT id, name, team_id FROM users WHERE id = $1", [targetId]);
      if (!user) return fail("Person not found", 404);
      if (!isAdmin && String(user.team_id) !== String(actor.team_id)) return fail("You can only assign companies to people in your team.", 403);
      targetName = user.name;
    }
  }

  // ----- selection -> WHERE -----
  const sel = body.selection ?? {};
  let where: string;
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  let selectionKind: "ids" | "filters";
  let filtersText: string | null = null;

  if (typeof sel.query === "string") {
    selectionKind = "filters";
    filtersText = sel.query.slice(0, 4000);
    const raw: Record<string, string[]> = {};
    new URLSearchParams(filtersText).forEach((v, k) => (raw[k] = [...(raw[k] ?? []), v]));
    const built = buildWhere(parseFilters(raw), actor);
    where = built.sql;
    params.push(...built.params);
    const exclude = intList(sel.excludeIds);
    if (exclude.length) where += ` AND c.id <> ALL(${add(exclude)})`;
  } else {
    selectionKind = "ids";
    const ids = intList(sel.ids);
    if (!ids.length) return fail("Select at least one company.");
    where = `c.deleted_at IS NULL AND c.id = ANY(${add(ids)})`;
  }
  if (!isAdmin) where += ` AND ${leadScopeSql(add(actor.team_id))}`;

  // ----- what counts as already there / assigned elsewhere / will change -----
  const t = targetId !== null ? `${add(targetId)}::bigint` : "";
  const skip = mode === "skip_assigned";
  const cond = {
    team: {
      noop: `c.team_id = ${t}`,
      elsewhere: `(c.team_id IS NOT NULL AND c.team_id <> ${t})`,
      change: skip ? "c.team_id IS NULL" : `c.team_id IS DISTINCT FROM ${t}`,
      set: `owner_id = CASE WHEN c.owner_id IN (SELECT id FROM users WHERE team_id = ${t}) THEN c.owner_id ELSE NULL END, team_id = ${t}`,
    },
    user: {
      noop: `c.owner_id = ${t}`,
      elsewhere: `(c.owner_id IS NOT NULL AND c.owner_id <> ${t})`,
      change: skip ? "c.owner_id IS NULL" : `c.owner_id IS DISTINCT FROM ${t}`,
      set: `owner_id = ${t}, team_id = (SELECT team_id FROM users WHERE id = ${t})`,
    },
    remove_owner: { noop: "c.owner_id IS NULL", elsewhere: "false", change: "c.owner_id IS NOT NULL", set: "owner_id = NULL" },
    remove_team: {
      noop: "(c.team_id IS NULL AND c.owner_id IS NULL)",
      elsewhere: "false",
      change: "(c.team_id IS NOT NULL OR c.owner_id IS NOT NULL)",
      set: "owner_id = NULL, team_id = NULL",
    },
  }[action];

  const [counts] = await query<{ selected: number; already_there: number; assigned_elsewhere: number; will_change: number }>(
    `SELECT count(*)::int AS selected,
            count(*) FILTER (WHERE ${cond.noop})::int AS already_there,
            count(*) FILTER (WHERE ${cond.elsewhere})::int AS assigned_elsewhere,
            count(*) FILTER (WHERE ${cond.change})::int AS will_change
       ${FROM} WHERE ${where}`,
    params
  );

  if (body.dryRun) return NextResponse.json({ ...counts, target_name: targetName });
  if (counts.will_change === 0) return NextResponse.json({ ok: true, changed: 0, skipped: counts.selected, target_name: targetName });

  // ----- apply, with an audit trail of what each company was before -----
  const result = await withTransaction(async (client) => {
    const log = (
      await client.query(
        `INSERT INTO assignment_log (actor_id, actor_name, action, target_id, target_name, mode, selection_kind, filters, selected_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [actor.id, actor.name, action, targetId, targetName, mode, selectionKind, filtersText, counts.selected]
      )
    ).rows[0];
    const logParam = add(log.id);
    const update = await client.query(
      `WITH target AS (
         SELECT c.id, c.owner_id, c.team_id ${FROM} WHERE ${where} AND ${cond.change}
       ), logged AS (
         INSERT INTO assignment_log_items (log_id, company_id, prev_owner_id, prev_team_id)
         SELECT ${logParam}::bigint, id, owner_id, team_id FROM target RETURNING 1
       )
       UPDATE companies c SET ${cond.set} FROM target WHERE c.id = target.id`,
      params
    );
    await client.query("UPDATE assignment_log SET changed_count = $1 WHERE id = $2", [update.rowCount, log.id]);
    return { changed: update.rowCount ?? 0, log_id: Number(log.id) };
  });

  return NextResponse.json({ ok: true, ...result, skipped: counts.selected - result.changed, target_name: targetName });
}

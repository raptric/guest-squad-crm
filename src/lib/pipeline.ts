import { query, withTransaction } from "@/lib/db";
import { leadScopeSql, type Actor } from "@/lib/assignment";
import type { PipelineStatus } from "@/lib/pipeline-format";

// Pipeline = top-level Status + a Stage that belongs to it. Moved by hand (no automatic rules yet).

// All statuses with their stages, in order. `all` also returns switched-off ones (Settings); otherwise only active.
export async function fetchPipeline(opts: { all?: boolean; counts?: boolean } = {}): Promise<PipelineStatus[]> {
  const rows = await query<{ data: PipelineStatus[] }>(
    `SELECT coalesce(json_agg(s ORDER BY s.sort_order, s.id), '[]'::json) AS data FROM (
       SELECT st.id::text, st.name, st.color, st.sort_order, st.is_active,
              ${opts.counts ? "(SELECT count(*)::int FROM companies c WHERE c.deleted_at IS NULL AND c.pipeline_status_id = st.id)" : "NULL"} AS companies,
              coalesce((SELECT json_agg(json_build_object('id', g.id::text, 'name', g.name, 'sort_order', g.sort_order, 'is_active', g.is_active,
                                                          'companies', ${opts.counts ? "(SELECT count(*)::int FROM companies c WHERE c.deleted_at IS NULL AND c.pipeline_stage_id = g.id)" : "NULL"})
                                         ORDER BY g.sort_order, g.id)
                          FROM pipeline_stages g WHERE g.status_id = st.id ${opts.all ? "" : "AND g.is_active"}), '[]'::json) AS stages
         FROM pipeline_statuses st ${opts.all ? "" : "WHERE st.is_active"}
     ) s`
  );
  return rows[0].data;
}

// Who may change a company's status / stage: admins, the company's owner, and team leads for their team's companies.
export async function canMovePipeline(actor: Actor, companyId: number): Promise<boolean> {
  if (actor.role === "super_admin") return true;
  const params: unknown[] = [companyId, actor.id];
  let scope = "false";
  if (actor.role === "team_lead" && actor.team_id !== null && actor.team_id !== undefined) {
    params.push(actor.team_id);
    scope = leadScopeSql("$3");
  }
  const [row] = await query<{ ok: boolean }>(
    `SELECT (c.owner_id = $2::bigint OR ${scope}) AS ok FROM companies c WHERE c.id = $1 AND c.deleted_at IS NULL`,
    params
  );
  return !!row?.ok;
}

// Sets a company's status and stage (stage defaults to the first active stage of the status). Records history
// and an activity line. Returns what it changed to, or an error message.
export async function setCompanyPipeline(
  actor: { id: number | string; name: string },
  companyId: number,
  statusId: number,
  stageId: number | null
): Promise<{ error: string; status: number } | { ok: true; changed: boolean; status: string; stage: string }> {
  return withTransaction(async (client) => {
    const [company] = (
      await client.query(
        `SELECT c.id, ps.name AS from_status, pg.name AS from_stage, c.pipeline_status_id, c.pipeline_stage_id
           FROM companies c
           LEFT JOIN pipeline_statuses ps ON ps.id = c.pipeline_status_id
           LEFT JOIN pipeline_stages pg ON pg.id = c.pipeline_stage_id
          WHERE c.id = $1 AND c.deleted_at IS NULL FOR UPDATE OF c`,
        [companyId]
      )
    ).rows;
    if (!company) return { error: "Company not found", status: 404 };

    const [status] = (await client.query("SELECT id, name, is_active FROM pipeline_statuses WHERE id = $1", [statusId])).rows;
    if (!status) return { error: "That status doesn't exist.", status: 400 };

    let stage: { id: string; name: string; is_active: boolean } | undefined;
    if (stageId !== null) {
      stage = (await client.query("SELECT id, name, is_active FROM pipeline_stages WHERE id = $1 AND status_id = $2", [stageId, statusId])).rows[0];
      if (!stage) return { error: "That stage doesn't belong to the chosen status.", status: 400 };
    } else {
      stage = (await client.query("SELECT id, name, is_active FROM pipeline_stages WHERE status_id = $1 AND is_active ORDER BY sort_order, id LIMIT 1", [statusId])).rows[0];
      if (!stage) return { error: `${status.name} has no stages yet. Add one in Settings first.`, status: 400 };
    }
    // Switched-off values can't be newly chosen, but a company already sitting on one may keep it.
    const sameStatus = String(company.pipeline_status_id) === String(status.id);
    const sameStage = String(company.pipeline_stage_id) === String(stage.id);
    if (!status.is_active && !sameStatus) return { error: `${status.name} is switched off.`, status: 400 };
    if (!stage.is_active && !sameStage) return { error: `${stage.name} is switched off.`, status: 400 };

    if (sameStatus && sameStage) return { ok: true, changed: false, status: status.name, stage: stage.name };

    await client.query("UPDATE companies SET pipeline_status_id = $1, pipeline_stage_id = $2 WHERE id = $3", [status.id, stage.id, companyId]);
    await client.query(
      `INSERT INTO company_pipeline_history (company_id, from_status, from_stage, to_status, to_stage, changed_by, changed_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [companyId, company.from_status, company.from_stage, status.name, stage.name, actor.id, actor.name]
    );
    const from = company.from_status ? `${company.from_status} / ${company.from_stage}` : "no status";
    await client.query(
      `INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body)
       VALUES ($1, 'status_change', 'human', $2, $3)`,
      [companyId, actor.name, `Status changed from ${from} to ${status.name} / ${stage.name}.`]
    );
    return { ok: true, changed: true, status: status.name, stage: stage.name };
  });
}

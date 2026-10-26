import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction } from "@/lib/db";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const RULES = ["on_verified"];

// Change a pipeline rule. Admin only.   { rule: "on_verified", is_enabled?, status_id?, stage_id? }
// Picking a target needs both status_id and stage_id, both switched on, with the stage belonging to the status.
export async function PATCH(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can change rules.", 403);

  const body = (await request.json()) as { rule?: unknown; is_enabled?: unknown; status_id?: unknown; stage_id?: unknown };
  if (typeof body.rule !== "string" || !RULES.includes(body.rule)) return fail("Unknown rule.", 404);
  const wantsTarget = body.status_id !== undefined || body.stage_id !== undefined;
  const statusId = Number(body.status_id);
  const stageId = Number(body.stage_id);
  if (wantsTarget && (!Number.isInteger(statusId) || !Number.isInteger(stageId))) return fail("Choose both a status and a stage.");
  if (body.is_enabled !== undefined && typeof body.is_enabled !== "boolean") return fail("is_enabled must be true or false.");
  if (!wantsTarget && body.is_enabled === undefined) return fail("Nothing to change.");

  const result = await withTransaction(async (client) => {
    if (wantsTarget) {
      const [target] = (
        await client.query(
          `SELECT s.is_active AS s_on, g.is_active AS g_on
             FROM pipeline_statuses s JOIN pipeline_stages g ON g.status_id = s.id WHERE s.id = $1 AND g.id = $2`,
          [statusId, stageId]
        )
      ).rows;
      if (!target) return { error: "That stage doesn't belong to the chosen status." };
      if (!target.s_on || !target.g_on) return { error: "That status or stage is switched off." };
      await client.query("UPDATE pipeline_rules SET status_id = $1, stage_id = $2, updated_at = now() WHERE rule_key = $3", [statusId, stageId, body.rule]);
    }
    if (typeof body.is_enabled === "boolean") {
      await client.query("UPDATE pipeline_rules SET is_enabled = $1, updated_at = now() WHERE rule_key = $2", [body.is_enabled, body.rule]);
    }
    return { ok: true };
  });
  if ("error" in result) return fail(result.error);
  return NextResponse.json({ ok: true });
}

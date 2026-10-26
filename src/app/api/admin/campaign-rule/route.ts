import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction, isUniqueViolation } from "@/lib/db";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Change the campaign enrollment rule. Admin only.
//   { require_verified?: boolean }
//   { add: { status_id, stage_id | null } }   (stage_id null = any stage of that status)
//   { remove: <allowed id> }
export async function PATCH(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can change rules.", 403);

  const body = (await request.json()) as { require_verified?: unknown; add?: { status_id?: unknown; stage_id?: unknown }; remove?: unknown };
  if (body.require_verified === undefined && body.add === undefined && body.remove === undefined) return fail("Nothing to change.");
  if (body.require_verified !== undefined && typeof body.require_verified !== "boolean") return fail("require_verified must be true or false.");

  try {
    const result = await withTransaction<{ error: string; status?: number } | { ok: true }>(async (client) => {
      if (typeof body.require_verified === "boolean") {
        await client.query("UPDATE campaign_enrollment_rule SET require_verified = $1, updated_at = now() WHERE id = 1", [body.require_verified]);
      }

      if (body.add !== undefined) {
        const statusId = Number(body.add.status_id);
        const anyStage = body.add.stage_id === null || body.add.stage_id === undefined || body.add.stage_id === "";
        const stageId = anyStage ? null : Number(body.add.stage_id);
        if (!Number.isInteger(statusId) || (stageId !== null && !Number.isInteger(stageId))) return { error: "Choose a status and a stage." };

        const [status] = (await client.query("SELECT name, is_active FROM pipeline_statuses WHERE id = $1", [statusId])).rows;
        if (!status) return { error: "That status doesn't exist." };
        if (!status.is_active) return { error: `${status.name} is switched off.` };
        if (stageId !== null) {
          const [stage] = (await client.query("SELECT name, is_active FROM pipeline_stages WHERE id = $1 AND status_id = $2", [stageId, statusId])).rows;
          if (!stage) return { error: "That stage doesn't belong to the chosen status." };
          if (!stage.is_active) return { error: `${stage.name} is switched off.` };
          const [any] = (await client.query("SELECT 1 FROM campaign_enrollment_allowed WHERE status_id = $1 AND stage_id IS NULL", [statusId])).rows;
          if (any) return { error: `${status.name} › Any stage is already allowed.`, status: 409 };
        } else {
          // "Any stage" covers the individual stages, so they are replaced by it.
          await client.query("DELETE FROM campaign_enrollment_allowed WHERE status_id = $1", [statusId]);
        }
        await client.query("INSERT INTO campaign_enrollment_allowed (status_id, stage_id) VALUES ($1, $2)", [statusId, stageId]);
      }

      if (body.remove !== undefined) {
        const id = Number(body.remove);
        if (!Number.isInteger(id)) return { error: "Invalid entry." };
        await client.query("DELETE FROM campaign_enrollment_allowed WHERE id = $1", [id]);
      }
      return { ok: true };
    });
    if ("error" in result) return fail(result.error, result.status ?? 400);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("That combination is already in the list.", 409);
    throw e;
  }
}

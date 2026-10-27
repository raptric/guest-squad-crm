import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction } from "@/lib/db";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const RULES = ["on_verified", "on_scraped"];

// Change a pipeline rule. Admin only.
//   { rule: "on_verified" | "on_scraped", is_enabled?, status_id?, stage_id?, property_type? }
// Picking a target needs both status_id and stage_id, both switched on, with the stage belonging to the status.
// property_type (on_scraped only) is the scraper's default property type: a value from the Property Type list, or null for none.
// on_scraped has no on/off switch: the scraper always needs somewhere to start.
export async function PATCH(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can change rules.", 403);

  const body = (await request.json()) as { rule?: unknown; is_enabled?: unknown; status_id?: unknown; stage_id?: unknown; property_type?: unknown };
  if (typeof body.rule !== "string" || !RULES.includes(body.rule)) return fail("Unknown rule.", 404);
  const wantsTarget = body.status_id !== undefined || body.stage_id !== undefined;
  const statusId = Number(body.status_id);
  const stageId = Number(body.stage_id);
  if (wantsTarget && (!Number.isInteger(statusId) || !Number.isInteger(stageId))) return fail("Choose both a status and a stage.");
  if (body.is_enabled !== undefined && typeof body.is_enabled !== "boolean") return fail("is_enabled must be true or false.");
  if (body.is_enabled !== undefined && body.rule === "on_scraped") return fail("This rule can't be switched off.");
  const wantsType = body.property_type !== undefined;
  if (wantsType && body.rule !== "on_scraped") return fail("Only the scraper rule has a property type.");
  if (wantsType && body.property_type !== null && typeof body.property_type !== "string") return fail("property_type must be a text value or null.");
  if (!wantsTarget && !wantsType && body.is_enabled === undefined) return fail("Nothing to change.");

  const result = await withTransaction<{ error: string } | { ok: true }>(async (client) => {
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
    if (wantsType) {
      const value = typeof body.property_type === "string" ? body.property_type.trim() : "";
      if (value) {
        const [ok] = (await client.query("SELECT 1 FROM picklist_values WHERE field_name = 'property_type' AND is_active AND value = $1", [value])).rows;
        if (!ok) return { error: `${value} isn't in the Property Type list.` };
      }
      await client.query("UPDATE pipeline_rules SET property_type = $1, updated_at = now() WHERE rule_key = $2", [value || null, body.rule]);
    }
    if (typeof body.is_enabled === "boolean") {
      await client.query("UPDATE pipeline_rules SET is_enabled = $1, updated_at = now() WHERE rule_key = $2", [body.is_enabled, body.rule]);
    }
    return { ok: true };
  });
  if ("error" in result) return fail(result.error);
  return NextResponse.json({ ok: true });
}

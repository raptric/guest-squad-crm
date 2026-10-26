import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction, isUniqueViolation } from "@/lib/db";
import { STATUS_COLORS } from "@/lib/pipeline-format";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Rename, recolour (statuses), switch on / off, or move up / down a status or a stage. Admin only.
//   { name?, color?, is_active?, move?: "up" | "down" }
// Nothing is deleted: a switched-off value can't be picked any more, but companies already on it keep it.
export async function PATCH(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can change the pipeline.", 403);
  if ((kind !== "statuses" && kind !== "stages") || !/^\d+$/.test(id)) return fail("Not found", 404);
  const isStatus = kind === "statuses";
  const table = isStatus ? "pipeline_statuses" : "pipeline_stages";

  const body = (await request.json()) as { name?: unknown; color?: unknown; is_active?: unknown; move?: unknown };

  try {
    const result = await withTransaction<{ error: string; status: number } | { ok: true }>(async (client) => {
      const [row] = (await client.query(`SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`, [id])).rows;
      if (!row) return { error: "Not found", status: 404 };

      if (body.name !== undefined) {
        const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
        if (!name) return { error: "Give it a name.", status: 400 };
        if (name.length > 60) return { error: "Names can be at most 60 characters.", status: 400 };
        await client.query(`UPDATE ${table} SET name = $1 WHERE id = $2`, [name, id]);
      }

      if (body.color !== undefined) {
        if (!isStatus) return { error: "Only statuses have a colour.", status: 400 };
        if (typeof body.color !== "string" || !(body.color in STATUS_COLORS)) return { error: "Unknown colour.", status: 400 };
        await client.query("UPDATE pipeline_statuses SET color = $1 WHERE id = $2", [body.color, id]);
      }

      if (body.is_active !== undefined) {
        const on = body.is_active === true;
        if (on !== row.is_active) {
          if (isStatus && !on) {
            const [{ n }] = (await client.query("SELECT count(*)::int AS n FROM pipeline_statuses WHERE is_active AND id <> $1", [id])).rows;
            if (n === 0) return { error: "At least one status has to stay switched on.", status: 400 };
          }
          if (isStatus && on) {
            const [{ n }] = (await client.query("SELECT count(*)::int AS n FROM pipeline_stages WHERE status_id = $1 AND is_active", [id])).rows;
            if (n === 0) return { error: "Switch on at least one of its stages first.", status: 400 };
          }
          if (!isStatus && !on) {
            const [parent] = (await client.query("SELECT is_active FROM pipeline_statuses WHERE id = $1", [row.status_id])).rows;
            const [{ n }] = (await client.query("SELECT count(*)::int AS n FROM pipeline_stages WHERE status_id = $1 AND is_active AND id <> $2", [row.status_id, id])).rows;
            if (parent.is_active && n === 0) return { error: "A status needs at least one stage switched on. Add another stage first, or switch the status off.", status: 400 };
          }
          await client.query(`UPDATE ${table} SET is_active = $1 WHERE id = $2`, [on, id]);
        }
      }

      if (body.move !== undefined) {
        if (body.move !== "up" && body.move !== "down") return { error: "move must be up or down.", status: 400 };
        const siblings = (
          await client.query(`SELECT id FROM ${table} ${isStatus ? "" : "WHERE status_id = $1"} ORDER BY sort_order, id`, isStatus ? [] : [row.status_id])
        ).rows.map((r) => String(r.id));
        const i = siblings.indexOf(String(id));
        const j = body.move === "up" ? i - 1 : i + 1;
        if (j >= 0 && j < siblings.length) {
          [siblings[i], siblings[j]] = [siblings[j], siblings[i]];
          for (let k = 0; k < siblings.length; k++) await client.query(`UPDATE ${table} SET sort_order = $1 WHERE id = $2`, [(k + 1) * 10, siblings[k]]);
        }
      }
      return { ok: true };
    });
    if ("error" in result) return fail(result.error, result.status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(isStatus ? "A status with this name already exists." : "That status already has a stage with this name.", 409);
    throw e;
  }
}

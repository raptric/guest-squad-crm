import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction, isUniqueViolation } from "@/lib/db";
import { STATUS_COLORS } from "@/lib/pipeline-format";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

// Add a status (with its first stage) or a stage to an existing status. Admin only.
//   { kind: "status", name, color?, first_stage }   |   { kind: "stage", status_id, name }
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can change the pipeline.", 403);

  const body = (await request.json()) as Record<string, unknown>;
  const name = cleanName(body.name);
  if (!name) return fail("Give it a name.");
  if (name.length > 60) return fail("Names can be at most 60 characters.");

  try {
    await withTransaction(async (client) => {
      if (body.kind === "status") {
        const firstStage = cleanName(body.first_stage);
        if (!firstStage) throw new Error("A status needs a first stage: type its name.");
        if (firstStage.length > 60) throw new Error("Names can be at most 60 characters.");
        const color = typeof body.color === "string" && body.color in STATUS_COLORS ? body.color : "zinc";
        const [{ next }] = (await client.query("SELECT coalesce(max(sort_order), 0) + 10 AS next FROM pipeline_statuses")).rows;
        const status = (await client.query("INSERT INTO pipeline_statuses (name, color, sort_order) VALUES ($1, $2, $3) RETURNING id", [name, color, next])).rows[0];
        await client.query("INSERT INTO pipeline_stages (status_id, name, sort_order) VALUES ($1, $2, 10)", [status.id, firstStage]);
      } else if (body.kind === "stage") {
        const statusId = Number(body.status_id);
        if (!Number.isInteger(statusId)) throw new Error("Choose a status.");
        const [status] = (await client.query("SELECT id FROM pipeline_statuses WHERE id = $1", [statusId])).rows;
        if (!status) throw new Error("That status doesn't exist.");
        const [{ next }] = (await client.query("SELECT coalesce(max(sort_order), 0) + 10 AS next FROM pipeline_stages WHERE status_id = $1", [statusId])).rows;
        await client.query("INSERT INTO pipeline_stages (status_id, name, sort_order) VALUES ($1, $2, $3)", [statusId, name, next]);
      } else {
        throw new Error("kind must be status or stage.");
      }
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(body.kind === "stage" ? "That status already has a stage with this name." : "A status with this name already exists.", 409);
    if (e instanceof Error && !("code" in e)) return fail(e.message);
    throw e;
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canMovePipeline, setCompanyPipeline } from "@/lib/pipeline";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Set a company's status and stage by hand: { status_id, stage_id? } (stage defaults to the status's first stage).
// Allowed for admins, the company's owner, and team leads for their team's companies.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid company id");
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);

  const body = (await request.json()) as { status_id?: unknown; stage_id?: unknown };
  const statusId = Number(body.status_id);
  const stageId = body.stage_id === undefined || body.stage_id === null || body.stage_id === "" ? null : Number(body.stage_id);
  if (!Number.isInteger(statusId) || (stageId !== null && !Number.isInteger(stageId))) return fail("Choose a status and a stage.");

  if (!(await canMovePipeline(actor, Number(id)))) return fail("Only the owner, their team lead or an admin can change this company's status.", 403);

  const result = await setCompanyPipeline(actor, Number(id), statusId, stageId);
  if ("error" in result) return fail(result.error, result.status);
  return NextResponse.json(result);
}

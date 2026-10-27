import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canAssign } from "@/lib/assignment";
import { deleteDuplicates } from "@/lib/duplicates";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Keep one copy and delete the others (soft delete, can be undone).   { keep_id, delete_ids: [..] }
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);
  if (!canAssign(actor)) return fail("Only admins and team leads can delete duplicates.", 403);

  const body = (await request.json()) as { keep_id?: unknown; delete_ids?: unknown };
  const keepId = Number(body.keep_id);
  const deleteIds = Array.isArray(body.delete_ids) ? body.delete_ids.map(Number) : [];
  if (!Number.isInteger(keepId) || deleteIds.some((n) => !Number.isInteger(n))) return fail("Choose the copy to keep and the copies to delete.");

  const result = await deleteDuplicates(actor, keepId, deleteIds);
  if ("error" in result) return fail(result.error, result.status);
  return NextResponse.json(result);
}

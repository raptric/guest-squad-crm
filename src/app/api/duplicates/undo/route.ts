import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canAssign } from "@/lib/assignment";
import { undoDeletion } from "@/lib/duplicates";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Undo a duplicate delete: the deleted copies come back.   { deletion_id }
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);
  if (!canAssign(actor)) return fail("Only admins and team leads can restore duplicates.", 403);

  const body = (await request.json()) as { deletion_id?: unknown };
  const id = Number(body.deletion_id);
  if (!Number.isInteger(id)) return fail("Invalid delete.");

  const result = await undoDeletion(actor, id);
  if ("error" in result) return fail(result.error, result.status);
  return NextResponse.json(result);
}

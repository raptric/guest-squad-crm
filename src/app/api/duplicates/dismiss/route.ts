import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canAssign } from "@/lib/assignment";
import { dismissGroup } from "@/lib/duplicates";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// "Not duplicates": hide this group until a new copy joins it.   { company_ids: [..] }
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);
  if (!canAssign(actor)) return fail("Only admins and team leads can review duplicates.", 403);

  const body = (await request.json()) as { company_ids?: unknown };
  const ids = Array.isArray(body.company_ids) ? body.company_ids.map(Number) : [];
  if (ids.some((n) => !Number.isInteger(n))) return fail("Invalid companies.");

  const result = await dismissGroup(actor, ids);
  if ("error" in result) return fail(result.error, result.status);
  return NextResponse.json({ ok: true });
}

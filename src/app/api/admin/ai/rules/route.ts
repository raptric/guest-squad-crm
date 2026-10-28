import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { checkRules, requireAdmin, saveRules } from "@/lib/ai/content";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Save the writing rules (and keep the old ones in the history). Admin only.   { rules: Rules }
export async function PUT(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return fail("Only admins can change AI settings.", 403);

  const body = (await request.json().catch(() => ({}))) as { rules?: unknown };
  const checked = checkRules(body.rules);
  if ("error" in checked) return fail(checked.error);

  await withTransaction((client) => saveRules(client, checked.value, actor.id));
  return NextResponse.json({ ok: true });
}

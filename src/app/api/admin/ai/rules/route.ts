import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { checkRulesText, requireAdmin, saveRules } from "@/lib/ai/content";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Save the writing rules text (and keep the old text in the history). Admin only.   { text: string }
export async function PUT(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return fail("Only admins can change AI settings.", 403);

  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const checked = checkRulesText(body.text);
  if ("error" in checked) return fail(checked.error);

  await withTransaction((client) => saveRules(client, checked.value, actor.id));
  return NextResponse.json({ ok: true });
}

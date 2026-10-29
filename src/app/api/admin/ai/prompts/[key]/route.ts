import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { checkPromptBody, isPromptKey, requireAdmin, savePrompt } from "@/lib/ai/content";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Save one prompt (and keep the old text in the history). Admin only.   { body: string }
export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const actor = await requireAdmin();
  if (!actor) return fail("Only admins can change AI settings.", 403);
  const { key } = await params;
  if (!isPromptKey(key)) return fail("Unknown prompt.", 404);

  const body = (await request.json().catch(() => ({}))) as { body?: unknown };
  const checked = checkPromptBody(body.body);
  if ("error" in checked) return fail(checked.error);

  await withTransaction((client) => savePrompt(client, key, checked.value, actor.id));
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { checkKnowledgeBody, isKnowledgeKey, requireAdmin, saveKnowledge } from "@/lib/ai/content";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Save the text of one knowledge topic (and keep the old text in the history). Admin only.   { body: string }
export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const actor = await requireAdmin();
  if (!actor) return fail("Only admins can change AI settings.", 403);
  const key = decodeURIComponent((await params).key);
  if (!(await isKnowledgeKey(key))) return fail("Unknown topic.", 404);

  const body = (await request.json().catch(() => ({}))) as { body?: unknown };
  const checked = checkKnowledgeBody(body.body);
  if ("error" in checked) return fail(checked.error);

  await withTransaction((client) => saveKnowledge(client, key, checked.value, actor.id));
  return NextResponse.json({ ok: true });
}

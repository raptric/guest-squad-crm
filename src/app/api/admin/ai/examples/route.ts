import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { checkExample, createExample, requireAdmin } from "@/lib/ai/content";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Add an example. Admin only.   { role, audience, subject, body, kind, note }
export async function POST(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return fail("Only admins can change AI settings.", 403);

  const checked = checkExample(await request.json().catch(() => ({})));
  if ("error" in checked) return fail(checked.error);

  const id = await withTransaction((client) => createExample(client, checked.value, actor.id));
  return NextResponse.json({ ok: true, id });
}

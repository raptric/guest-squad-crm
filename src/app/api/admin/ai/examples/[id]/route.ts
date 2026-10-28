import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { checkExample, requireAdmin, updateExample } from "@/lib/ai/content";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Change an example. Admin only.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  if (!actor) return fail("Only admins can change AI settings.", 403);
  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Unknown example.", 404);

  const checked = checkExample(await request.json().catch(() => ({})));
  if ("error" in checked) return fail(checked.error);

  const ok = await withTransaction((client) => updateExample(client, id, checked.value, true, actor.id));
  return ok ? NextResponse.json({ ok: true }) : fail("Unknown example.", 404);
}

// Remove an example. It is only switched off, so the history can bring it back.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  if (!actor) return fail("Only admins can change AI settings.", 403);
  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Unknown example.", 404);

  const ok = await withTransaction(async (client) => {
    const { rows } = await client.query("SELECT role, audience, subject, body, kind, note FROM ai_examples WHERE id = $1", [id]);
    return rows[0] ? updateExample(client, id, rows[0], false, actor.id) : false;
  });
  return ok ? NextResponse.json({ ok: true }) : fail("Unknown example.", 404);
}

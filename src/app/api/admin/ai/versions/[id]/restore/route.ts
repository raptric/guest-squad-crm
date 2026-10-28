import { NextResponse } from "next/server";
import { withTransaction } from "@/lib/db";
import { checkExample, checkKnowledgeBody, checkRules, isKnowledgeKey, requireAdmin, saveKnowledge, saveRules, updateExample } from "@/lib/ai/content";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Put an earlier version back. The restore is itself saved as a new version, so nothing is lost. Admin only.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  if (!actor) return fail("Only admins can change AI settings.", 403);
  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Unknown version.", 404);

  const result = await withTransaction<{ error: string; status?: number } | { ok: true }>(async (client) => {
    const { rows } = await client.query("SELECT kind, ref, snapshot FROM ai_versions WHERE id = $1", [id]);
    const v = rows[0] as { kind: string; ref: string; snapshot: Record<string, unknown> } | undefined;
    if (!v) return { error: "Unknown version.", status: 404 };

    if (v.kind === "knowledge") {
      if (!(await isKnowledgeKey(v.ref))) return { error: "That topic no longer exists." };
      const body = checkKnowledgeBody(v.snapshot.body);
      if ("error" in body) return body;
      await saveKnowledge(client, v.ref, body.value, actor.id);
    } else if (v.kind === "rules") {
      const rules = checkRules(v.snapshot.data);
      if ("error" in rules) return { error: `This old version can't be restored: ${rules.error}` };
      await saveRules(client, rules.value, actor.id);
    } else {
      const ex = checkExample(v.snapshot);
      if ("error" in ex) return { error: `This old version can't be restored: ${ex.error}` };
      const ok = await updateExample(client, v.ref, ex.value, v.snapshot.is_active !== false, actor.id);
      if (!ok) return { error: "That example no longer exists.", status: 404 };
    }
    return { ok: true };
  });

  return "error" in result ? fail(result.error, result.status ?? 400) : NextResponse.json({ ok: true });
}

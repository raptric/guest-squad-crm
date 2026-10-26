import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction, isUniqueViolation } from "@/lib/db";
import { parseCampaignInput } from "@/lib/campaigns";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Edit a campaign, or archive / restore it (admin only).
//   { status: "archived" | "active" }                      -> just change its status
//   { name, description, steps: [...] (, status) }          -> replace its details and steps
// Editing never touches tasks that already exist: each task keeps its own copy of the step it came from,
// so changes only apply to people enrolled from now on.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can edit campaigns.", 403);

  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid campaign id");
  const body = (await request.json()) as Record<string, unknown>;

  const status = body.status;
  if (status !== undefined && status !== "active" && status !== "archived") return fail("status must be 'active' or 'archived'");

  try {
    const found = await withTransaction(async (client) => {
      const existing = (await client.query("SELECT id FROM campaigns WHERE id = $1 FOR UPDATE", [id])).rows[0];
      if (!existing) return false;

      if ("steps" in body) {
        const parsed = parseCampaignInput(body);
        if ("error" in parsed) throw Object.assign(new Error(parsed.error), { userError: true });
        const { name, description, steps } = parsed.value;
        await client.query("UPDATE campaigns SET name = $1, description = $2, updated_at = now() WHERE id = $3", [name, description, id]);
        await client.query("DELETE FROM campaign_steps WHERE campaign_id = $1", [id]);
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          await client.query(
            "INSERT INTO campaign_steps (campaign_id, position, day_number, channel, title, instructions) VALUES ($1, $2, $3, $4, $5, $6)",
            [id, i + 1, s.day_number, s.channel, s.title, s.instructions]
          );
        }
      }
      if (status !== undefined) await client.query("UPDATE campaigns SET status = $1, updated_at = now() WHERE id = $2", [status, id]);
      return true;
    });
    if (!found) return fail("Campaign not found", 404);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("A campaign with that name already exists.", 409);
    if (e instanceof Error && (e as Error & { userError?: boolean }).userError) return fail(e.message);
    throw e;
  }
}

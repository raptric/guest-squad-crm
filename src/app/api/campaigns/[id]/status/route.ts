import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { canManageCampaign } from "@/lib/campaigns";
import { changeCampaignStatus } from "@/lib/campaign-status";

const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

// Activate / pause / resume / complete a campaign (its owner or an admin).
//   { status: "active" | "paused" | "completed", mode?: "finish" | "force_stop" }
// Completing with companies still running needs a mode: "finish" lets them carry on (no new ones), "force_stop" stops them all.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);
  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid campaign id");

  const [campaign] = await query<{ owner_id: string | null }>("SELECT owner_id FROM campaigns WHERE id = $1", [id]);
  if (!campaign || !canManageCampaign(actor, campaign.owner_id)) return fail("Campaign not found", 404);

  const body = (await request.json()) as { status?: unknown; mode?: unknown };
  if (body.status !== "active" && body.status !== "paused" && body.status !== "completed") return fail("status must be active, paused or completed");
  const mode = body.mode === "finish" || body.mode === "force_stop" ? body.mode : undefined;

  const result = await changeCampaignStatus(actor, Number(id), body.status, mode);
  if ("error" in result) return fail(result.error, result.status, result.running !== undefined ? { running: result.running } : {});
  return NextResponse.json(result);
}

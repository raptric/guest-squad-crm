import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { activationError, canManageCampaign, parseCampaignInput, resolveCampaignInput } from "@/lib/campaigns";
import { updateCampaign } from "@/lib/campaign-save";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Edit a campaign: its owner or an admin. A completed campaign is read-only. Existing tasks keep the steps they
// were created with, so changes apply to people enrolled from now on (the playbook is always the latest text).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);
  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid campaign id");

  const [existing] = await query<{
    status: string;
    visibility: string;
    team_id: string | null;
    owner_id: string | null;
    outreach_angle: string | null;
    secondary_pains: string[];
    differentiators: string[];
  }>("SELECT status, visibility, team_id, owner_id, outreach_angle, secondary_pains, differentiators FROM campaigns WHERE id = $1", [id]);
  // Anyone who can't manage it gets the same answer as for a campaign that doesn't exist.
  if (!existing || !canManageCampaign(actor, existing.owner_id)) return fail("Campaign not found", 404);
  if (existing.status === "completed") return fail("A completed campaign can't be edited. Duplicate it to run it again.", 409);

  const parsed = parseCampaignInput(await request.json());
  if ("error" in parsed) return fail(parsed.error);
  const input = parsed.value;
  if (existing.status === "active" || existing.status === "paused") {
    const problem = activationError(input);
    if (problem) return fail(problem);
  }
  const resolved = await resolveCampaignInput(actor, input, existing);
  if ("error" in resolved) return fail(resolved.error);

  await updateCampaign(Number(id), input, resolved.value);
  return NextResponse.json({ ok: true });
}

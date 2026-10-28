import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { activationError, parseCampaignInput, resolveCampaignInput } from "@/lib/campaigns";
import { createCampaign } from "@/lib/campaign-save";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Create a campaign (any signed-in person). It starts as a Draft, or Active if its playbook is filled in.
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);

  const parsed = parseCampaignInput(await request.json());
  if ("error" in parsed) return fail(parsed.error);
  const input = parsed.value;
  if (input.status === "active") {
    const problem = activationError(input);
    if (problem) return fail(problem);
  }
  const resolved = await resolveCampaignInput(actor, input);
  if ("error" in resolved) return fail(resolved.error);

  const created = await createCampaign(actor.id, input, resolved.value);
  return NextResponse.json(created, { status: 201 });
}

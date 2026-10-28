import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { parseCampaignInput } from "@/lib/campaigns";
import { fetchFitCounts } from "@/lib/campaign-fit";

// Live preview on the campaign form: how many companies this person could enroll right now would be a strong,
// partial or weak fit for the (not yet saved) criteria.   { criteria }
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { criteria?: unknown };
  // Reuse the campaign parser so the criteria are validated exactly as when saving.
  const parsed = parseCampaignInput({ name: "preview", steps: [{ day_number: 1, channel: "Email", title: "preview" }], criteria: body.criteria });
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  return NextResponse.json(await fetchFitCounts(actor, parsed.value.criteria));
}

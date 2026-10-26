import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction, isUniqueViolation } from "@/lib/db";
import { parseCampaignInput } from "@/lib/campaigns";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Create a campaign with its steps. Admin only.
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can create campaigns.", 403);

  const parsed = parseCampaignInput(await request.json());
  if ("error" in parsed) return fail(parsed.error);
  const { name, description, steps } = parsed.value;

  try {
    const id = await withTransaction(async (client) => {
      const campaign = (
        await client.query("INSERT INTO campaigns (name, description, created_by) VALUES ($1, $2, $3) RETURNING id", [name, description, actor.id])
      ).rows[0];
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        await client.query(
          "INSERT INTO campaign_steps (campaign_id, position, day_number, channel, title, instructions) VALUES ($1, $2, $3, $4, $5, $6)",
          [campaign.id, i + 1, s.day_number, s.channel, s.title, s.instructions]
        );
      }
      return Number(campaign.id);
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("A campaign with that name already exists.", 409);
    throw e;
  }
}

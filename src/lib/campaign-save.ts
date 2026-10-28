import type { Client } from "pg";
import { withTransaction } from "@/lib/db";
import type { CampaignInput, ResolvedCampaign } from "@/lib/campaigns";

async function writeSteps(client: Client, campaignId: number | string, input: CampaignInput) {
  await client.query("DELETE FROM campaign_steps WHERE campaign_id = $1", [campaignId]);
  for (let i = 0; i < input.steps.length; i++) {
    const s = input.steps[i];
    await client.query(
      "INSERT INTO campaign_steps (campaign_id, position, day_number, channel, title, instructions) VALUES ($1, $2, $3, $4, $5, $6)",
      [campaignId, i + 1, s.day_number, s.channel, s.title, s.instructions]
    );
  }
}

export async function createCampaign(actorId: number | string, input: CampaignInput, resolved: ResolvedCampaign) {
  return withTransaction(async (client) => {
    const row = (
      await client.query(
        `INSERT INTO campaigns (name, description, status, created_by, owner_id, visibility, team_id, outreach_angle, pain_point, secondary_pains, secondary_other,
                                positioning, differentiators, differentiators_other,
                                target_company_types, target_property_types, rooms_min, rooms_max, target_portfolio, target_countries)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING id, code`,
        [
          input.name, input.description, input.status, actorId, resolved.owner_id, resolved.visibility, resolved.team_id,
          input.outreach_angle, input.pain_point, input.secondary_pains, input.secondary_other, input.positioning, input.differentiators, input.differentiators_other,
          input.criteria.company_types, input.criteria.property_types, input.criteria.rooms_min, input.criteria.rooms_max,
          input.criteria.portfolio, input.criteria.countries,
        ]
      )
    ).rows[0];
    await writeSteps(client, row.id, input);
    return { id: Number(row.id), code: row.code as string };
  });
}

// Replaces a campaign's details. Existing tasks keep the steps they were created with.
export async function updateCampaign(id: number, input: CampaignInput, resolved: ResolvedCampaign) {
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE campaigns SET name = $1, description = $2, owner_id = $3, visibility = $4, team_id = $5, outreach_angle = $6, pain_point = $7,
              secondary_pains = $8, secondary_other = $9, positioning = $10, differentiators = $11, differentiators_other = $12,
              target_company_types = $13, target_property_types = $14, rooms_min = $15, rooms_max = $16, target_portfolio = $17,
              target_countries = $18, updated_at = now() WHERE id = $19`,
      [
        input.name, input.description, resolved.owner_id, resolved.visibility, resolved.team_id,
        input.outreach_angle, input.pain_point, input.secondary_pains, input.secondary_other, input.positioning, input.differentiators, input.differentiators_other,
        input.criteria.company_types, input.criteria.property_types, input.criteria.rooms_min, input.criteria.rooms_max,
        input.criteria.portfolio, input.criteria.countries, id,
      ]
    );
    await writeSteps(client, id, input);
  });
}

// A copy of a campaign: the details, steps and messaging. Not the enrollments. Starts as the copier's own Private Draft.
export async function duplicateCampaign(sourceId: number, actorId: number | string) {
  return withTransaction(async (client) => {
    const row = (
      await client.query(
        `INSERT INTO campaigns (name, description, status, created_by, owner_id, visibility, copied_from, outreach_angle, pain_point, secondary_pains, secondary_other,
                                positioning, differentiators, differentiators_other,
                                target_company_types, target_property_types, rooms_min, rooms_max, target_portfolio, target_countries)
         SELECT left(name, 112) || ' (copy)', description, 'draft', $2, $2, 'private', id, outreach_angle, pain_point, secondary_pains, secondary_other,
                positioning, differentiators, differentiators_other,
                target_company_types, target_property_types, rooms_min, rooms_max, target_portfolio, target_countries
           FROM campaigns WHERE id = $1 RETURNING id, code`,
        [sourceId, actorId]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO campaign_steps (campaign_id, position, day_number, channel, title, instructions)
       SELECT $2, position, day_number, channel, title, instructions FROM campaign_steps WHERE campaign_id = $1`,
      [sourceId, row.id]
    );
    return { id: Number(row.id), code: row.code as string };
  });
}

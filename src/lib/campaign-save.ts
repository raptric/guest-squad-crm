import type { Client } from "pg";
import { withTransaction } from "@/lib/db";
import type { CampaignInput, ResolvedCampaign } from "@/lib/campaigns";

// Steps are replaced on every save. A baseline email that is unchanged (same subject and text) keeps who saved it and when;
// new or changed text is credited to the person saving now.
async function writeSteps(client: Client, campaignId: number | string, input: CampaignInput, actorId: number | string) {
  const before = (await client.query("SELECT subject, body, copy_by, copy_at FROM campaign_steps WHERE campaign_id = $1", [campaignId])).rows as {
    subject: string;
    body: string;
    copy_by: string | null;
    copy_at: string | null;
  }[];
  const known = new Map(before.filter((r) => r.body).map((r) => [`${r.subject}\u0000${r.body}`, r]));
  await client.query("DELETE FROM campaign_steps WHERE campaign_id = $1", [campaignId]);
  for (let i = 0; i < input.steps.length; i++) {
    const s = input.steps[i];
    const kept = s.body ? known.get(`${s.subject}\u0000${s.body}`) : undefined;
    await client.query(
      `INSERT INTO campaign_steps (campaign_id, position, day_number, channel, title, instructions, subject, body, copy_source, copy_by, copy_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        campaignId, i + 1, s.day_number, s.channel, s.title, s.instructions, s.subject, s.body, s.copy_source,
        s.body ? (kept ? kept.copy_by : actorId) : null,
        s.body ? (kept ? kept.copy_at : new Date().toISOString()) : null,
      ]
    );
  }
}

export async function createCampaign(actorId: number | string, input: CampaignInput, resolved: ResolvedCampaign) {
  return withTransaction(async (client) => {
    const row = (
      await client.query(
        `INSERT INTO campaigns (name, description, status, created_by, owner_id, visibility, team_id, outreach_angle, pain_point, secondary_pains, secondary_other,
                                positioning, differentiators, differentiators_other, call_to_action,
                                target_company_types, target_property_types, rooms_min, rooms_max, target_portfolio, target_countries)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) RETURNING id, code`,
        [
          input.name, input.description, input.status, actorId, resolved.owner_id, resolved.visibility, resolved.team_id,
          input.outreach_angle, input.pain_point, input.secondary_pains, input.secondary_other, input.positioning, input.differentiators, input.differentiators_other,
          input.call_to_action,
          input.criteria.company_types, input.criteria.property_types, input.criteria.rooms_min, input.criteria.rooms_max,
          input.criteria.portfolio, input.criteria.countries,
        ]
      )
    ).rows[0];
    await writeSteps(client, row.id, input, actorId);
    return { id: Number(row.id), code: row.code as string };
  });
}

// Replaces a campaign's details. Existing tasks keep the steps they were created with.
export async function updateCampaign(id: number, input: CampaignInput, resolved: ResolvedCampaign, actorId: number | string) {
  return withTransaction(async (client) => {
    await client.query(
      `UPDATE campaigns SET name = $1, description = $2, owner_id = $3, visibility = $4, team_id = $5, outreach_angle = $6, pain_point = $7,
              secondary_pains = $8, secondary_other = $9, positioning = $10, differentiators = $11, differentiators_other = $12, call_to_action = $13,
              target_company_types = $14, target_property_types = $15, rooms_min = $16, rooms_max = $17, target_portfolio = $18,
              target_countries = $19, updated_at = now() WHERE id = $20`,
      [
        input.name, input.description, resolved.owner_id, resolved.visibility, resolved.team_id,
        input.outreach_angle, input.pain_point, input.secondary_pains, input.secondary_other, input.positioning, input.differentiators, input.differentiators_other,
        input.call_to_action,
        input.criteria.company_types, input.criteria.property_types, input.criteria.rooms_min, input.criteria.rooms_max,
        input.criteria.portfolio, input.criteria.countries, id,
      ]
    );
    await writeSteps(client, id, input, actorId);
  });
}

// A copy of a campaign: the details, steps and messaging. Not the enrollments. Starts as the copier's own Private Draft.
export async function duplicateCampaign(sourceId: number, actorId: number | string) {
  return withTransaction(async (client) => {
    const row = (
      await client.query(
        `INSERT INTO campaigns (name, description, status, created_by, owner_id, visibility, copied_from, outreach_angle, pain_point, secondary_pains, secondary_other,
                                positioning, differentiators, differentiators_other, call_to_action,
                                target_company_types, target_property_types, rooms_min, rooms_max, target_portfolio, target_countries)
         SELECT left(name, 112) || ' (copy)', description, 'draft', $2, $2, 'private', id, outreach_angle, pain_point, secondary_pains, secondary_other,
                positioning, differentiators, differentiators_other, call_to_action,
                target_company_types, target_property_types, rooms_min, rooms_max, target_portfolio, target_countries
           FROM campaigns WHERE id = $1 RETURNING id, code`,
        [sourceId, actorId]
      )
    ).rows[0];
    await client.query(
      `INSERT INTO campaign_steps (campaign_id, position, day_number, channel, title, instructions, subject, body, copy_source, copy_by, copy_at)
       SELECT $2, position, day_number, channel, title, instructions, subject, body, copy_source, copy_by, copy_at FROM campaign_steps WHERE campaign_id = $1`,
      [sourceId, row.id]
    );
    return { id: Number(row.id), code: row.code as string };
  });
}

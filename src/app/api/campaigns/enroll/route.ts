import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { query, withTransaction, isUniqueViolation } from "@/lib/db";
import { checkEnrollable, fetchEnrollmentRule } from "@/lib/campaign-rule";
import { campaignVisibleSql } from "@/lib/campaigns";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Enroll a company in a campaign. Rules:
//   * only the company's OWNER can enroll it
//   * the company must meet the enrollment rule set in Settings (verified? allowed status / stage?)
//   * a company can be in one active campaign at a time (more recipients can join that same campaign)
//   * the recipient is one of the company's contacts, or the company's general email / phone
// One task is created per step, due (start date + day - 1): Day 1 is the enrollment day.
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);

  const body = (await request.json()) as {
    company_id?: unknown;
    campaign_id?: unknown;
    recipient?: { type?: string; contact_id?: unknown };
    start_date?: unknown;
  };
  const companyId = Number(body.company_id);
  const campaignId = Number(body.campaign_id);
  if (!Number.isInteger(companyId) || companyId <= 0) return fail("Invalid company");
  if (!Number.isInteger(campaignId) || campaignId <= 0) return fail("Choose a campaign.");

  const [company] = await query<{
    id: string;
    name: string;
    owner_id: string | null;
    verification_status: string | null;
    email: string | null;
    phone: string | null;
    pipeline_status_id: string | null;
    pipeline_stage_id: string | null;
    status_name: string | null;
    stage_name: string | null;
  }>(
    `SELECT c.id, c.name, c.owner_id, c.verification_status, c.email, c.phone, c.pipeline_status_id, c.pipeline_stage_id,
            ps.name AS status_name, pst.name AS stage_name
       FROM companies c
       LEFT JOIN pipeline_statuses ps ON ps.id = c.pipeline_status_id
       LEFT JOIN pipeline_stages pst ON pst.id = c.pipeline_stage_id
      WHERE c.id = $1 AND c.deleted_at IS NULL`,
    [companyId]
  );
  if (!company) return fail("Company not found", 404);
  if (company.owner_id === null || String(company.owner_id) !== String(actor.id)) return fail("Only the owner of this company can enroll it in a campaign.", 403);
  const eligible = checkEnrollable(await fetchEnrollmentRule(), company);
  if (!eligible.ok) return fail(eligible.reason);

  const visParams: unknown[] = [campaignId];
  const visAdd = (v: unknown) => {
    visParams.push(v);
    return `$${visParams.length}`;
  };
  const [campaign] = await query<{ id: string; name: string; status: string }>(
    `SELECT k.id, k.name, k.status FROM campaigns k WHERE k.id = $1 AND ${campaignVisibleSql(actor, "k", visAdd)}`,
    visParams
  );
  if (!campaign) return fail("Campaign not found", 404);
  if (campaign.status !== "active") return fail(`That campaign is ${campaign.status === "draft" ? "still a draft" : campaign.status}, so it isn't open for enrollment.`);
  const steps = await query<{ position: number; day_number: number; channel: string; title: string; instructions: string }>(
    "SELECT position, day_number, channel, title, instructions FROM campaign_steps WHERE campaign_id = $1 ORDER BY position",
    [campaignId]
  );
  if (!steps.length) return fail("That campaign has no steps yet.");

  // One active campaign per company.
  const [other] = await query<{ name: string }>(
    `SELECT k.name FROM campaign_enrollments e JOIN campaigns k ON k.id = e.campaign_id
      WHERE e.company_id = $1 AND e.status = 'active' AND e.campaign_id <> $2 LIMIT 1`,
    [companyId, campaignId]
  );
  if (other) return fail(`This company is already in "${other.name}". Finish or stop that campaign first.`, 409);

  // ----- recipient -----
  let contactId: number | null = null;
  let recipientLabel: string;
  const recipient = body.recipient ?? {};
  if (recipient.type === "contact") {
    contactId = Number(recipient.contact_id);
    const [contact] = Number.isInteger(contactId)
      ? await query<{ first_name: string; last_name: string | null; email: string | null }>(
          `SELECT ct.first_name, ct.last_name,
                  (SELECT ce.email FROM contact_emails ce WHERE ce.contact_id = ct.id ORDER BY ce.is_primary DESC NULLS LAST, ce.id LIMIT 1) AS email
             FROM contacts ct JOIN contact_companies cc ON cc.contact_id = ct.id
            WHERE ct.id = $1 AND cc.company_id = $2 AND ct.deleted_at IS NULL`,
          [contactId, companyId]
        )
      : [];
    if (!contact) return fail("That contact isn't linked to this company.");
    const fullName = `${contact.first_name} ${contact.last_name ?? ""}`.trim();
    recipientLabel = contact.email ? `${fullName} (${contact.email})` : fullName;
  } else if (recipient.type === "company") {
    const channel = company.email ?? company.phone;
    recipientLabel = channel ? `General contact (${channel})` : "General contact";
  } else {
    return fail("Choose who this campaign is for: a contact, or the company's general contact.");
  }

  // ----- start date: today (or a bit later), as YYYY-MM-DD -----
  const start = typeof body.start_date === "string" ? body.start_date : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(start))) return fail("Choose a start date.");
  const dayMs = 86_400_000;
  const todayUtc = Date.parse(new Date().toISOString().slice(0, 10));
  const startMs = Date.parse(start);
  if (startMs < todayUtc - dayMs) return fail("The start date can't be in the past.");
  if (startMs > todayUtc + 90 * dayMs) return fail("The start date can be at most 90 days from now.");

  try {
    const result = await withTransaction(async (client) => {
      const enrollment = (
        await client.query(
          `INSERT INTO campaign_enrollments (campaign_id, company_id, recipient_type, contact_id, recipient_label, start_date, enrolled_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [campaignId, companyId, recipient.type, contactId, recipientLabel, start, actor.id]
        )
      ).rows[0];
      for (const s of steps) {
        await client.query(
          `INSERT INTO campaign_tasks (enrollment_id, step_position, step_day, step_channel, step_title, step_instructions, due_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7::date + ($3 - 1))`,
          [enrollment.id, s.position, s.day_number, s.channel, s.title, s.instructions, start]
        );
      }
      await client.query(
        `INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body)
         VALUES ($1, 'note', 'human', $2, $3)`,
        [companyId, actor.name, `Enrolled in the campaign "${campaign.name}" for ${recipientLabel}. Starts ${start}, ${steps.length} ${steps.length === 1 ? "task" : "tasks"}.`]
      );
      return Number(enrollment.id);
    });
    return NextResponse.json({ ok: true, enrollment_id: result, tasks: steps.length }, { status: 201 });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("That recipient is already in this campaign.", 409);
    throw e;
  }
}

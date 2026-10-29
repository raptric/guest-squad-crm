import { withTransaction } from "@/lib/db";
import { getTaskForAction } from "@/lib/campaigns";
import { isEmailChannel } from "@/lib/campaign-messages-format";
import { renderTemplate } from "./codes-format";
import { buildValues, type ContactChoice } from "./context";
import { check, COMPANY_TAIL, GenerateError, parseVersions, prepare, runAi, type Version } from "./generate";

type Actor = { id: number | string; name: string; email: string; role: string; team_id: number | string | null; phone?: string | null; job_title?: string | null };

const PROMPT_FOR_CHANNEL: Record<string, string> = { "Initial Email": "company_initial_email", "Follow-up Email": "company_followup_email" };

// A draft that has been saved on the task.
export type CompanyDraft = Version & { id: string; facts_used: string[]; notes: string };
export type CompanyGenerated = { versions: CompanyDraft[]; remaining: number; thin: boolean };

// The facts that make an email specific: what the CRM holds about the company beyond its name.
const FACT_CODES = ["company.ratings", "company.pain_signals", "company.hiring", "company.signals", "company.offer", "company.why_now"];

// Write the email for one task, for that task's company and contact, starting from the campaign's baseline for the step. The drafts are
// saved on the task (older unsent drafts are replaced), so opening the task again costs nothing.
export async function generateForCompany(input: { actor: Actor; taskId: number; instruction: string }): Promise<CompanyGenerated> {
  const { actor } = input;
  const task = await getTaskForAction(actor, input.taskId);
  if (!task) throw new GenerateError("Task not found.", 404);
  if (!task.allowed) throw new GenerateError("This task belongs to someone else.", 403);
  const promptKey = PROMPT_FOR_CHANNEL[task.step_channel];
  if (!promptKey || !isEmailChannel(task.step_channel)) throw new GenerateError("AI writing is for Initial Email and Follow-up Email steps.", 400);
  if (task.status !== "pending") throw new GenerateError("This task is already finished.", 400);
  if (task.enrollment_status !== "active") throw new GenerateError("This campaign is no longer active.", 400);
  if (task.campaign_status === "paused") throw new GenerateError("This campaign is paused. You can work on its tasks again when it resumes.", 400);

  const rt = await prepare(actor, promptKey);
  const contact: ContactChoice = task.contact_id ? { kind: "contact", id: Number(task.contact_id) } : { kind: "company" };
  const { values, notes } = await buildValues({
    actor,
    // the person may be a lead or admin working a team member's task, and the campaign need not be one they could otherwise open
    campaignActor: { id: actor.id, role: "super_admin", team_id: null },
    campaignId: task.campaign_id,
    stepNumber: task.step_position,
    companyId: Number(task.company_id),
    contact,
    expectChannel: task.step_channel,
  });
  if (!Object.keys(values).length) throw new GenerateError(notes[0] ?? "Could not read the campaign for this task.", 404);

  const thin = !FACT_CODES.some((c) => (values[c] ?? "").trim());
  const extra = input.instruction.replace(/\s+/g, " ").trim().slice(0, 300);
  const prompt = `${renderTemplate(rt.template, values).text}\n${COMPANY_TAIL(rt.variants, extra)}`;

  const { value } = await runAi(actor, rt, "company_copy", prompt, (r) => parseVersions(r, rt.variants).map((v) => ({ ...check(v, task.step_channel, []), facts_used: v.facts_used, notes: v.notes })));

  const saved = await withTransaction(async (client) => {
    await client.query("UPDATE campaign_messages SET status = 'void' WHERE task_id = $1 AND status = 'draft'", [task.id]);
    const out: CompanyDraft[] = [];
    for (const v of value) {
      const { rows } = await client.query(
        `INSERT INTO campaign_messages (task_id, enrollment_id, campaign_id, company_id, contact_id, step_position, step_day, channel, subject, body, source, status, facts_used, notes, model, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ai', 'draft', $11, $12, $13, $14) RETURNING id::text`,
        [task.id, task.enrollment_id, task.campaign_id, task.company_id, task.contact_id, task.step_position, task.step_day, task.step_channel, v.subject, v.body, JSON.stringify(v.facts_used), v.notes, rt.model, actor.id],
      );
      out.push({ ...v, id: rows[0].id as string });
    }
    return out;
  });

  return { versions: saved, remaining: Math.max(0, rt.dailyLimit - rt.used - 1), thin };
}

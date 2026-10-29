import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction } from "@/lib/db";
import { activityTypeFor, getTaskForAction } from "@/lib/campaigns";
import { isEmailChannel, type MessageSource } from "@/lib/campaign-messages-format";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Tick a task off by hand: { action: "done" | "skip" | "reopen", notes? }.
//   done    optional notes; on an email step also the email that was sent: message = { subject, body, source }
//   skip    needs a note (why)
//   reopen  undo a done / skipped task (mistakes happen)
// Allowed for the company's owner, the team lead (for their team's companies) and admins. Every action is recorded on
// the company's activity timeline; when the last pending task is finished the enrollment is marked completed.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);

  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid task");
  const body = (await request.json()) as { action?: string; notes?: unknown; message?: { subject?: unknown; body?: unknown; source?: unknown } };
  const action = body.action;
  if (action !== "done" && action !== "skip" && action !== "reopen") return fail("action must be 'done', 'skip' or 'reopen'");
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length > 2000) return fail("Notes must be 2,000 characters or fewer.");
  if (action === "skip" && !notes) return fail("Add a short note saying why you're skipping this step.");

  // The email that was sent, when the person confirmed one. Only email steps record it, and an empty one is simply not recorded.
  let message: { subject: string; body: string; source: MessageSource } | null = null;
  if (action === "done" && body.message) {
    const subject = typeof body.message.subject === "string" ? body.message.subject.replace(/\s+/g, " ").trim() : "";
    const text = typeof body.message.body === "string" ? body.message.body.replace(/\r\n/g, "\n").trim() : "";
    if (subject.length > 300) return fail("The subject must be 300 characters or fewer.");
    if (text.length > 10000) return fail("The email must be 10,000 characters or fewer.");
    const source = (["baseline", "ai", "edited", "human"] as const).find((x) => x === body.message?.source) ?? "human";
    if (text) message = { subject, body: text, source };
  }

  const task = await getTaskForAction(actor, Number(id));
  if (!task) return fail("Task not found", 404);
  if (!task.allowed) return fail("This task belongs to someone else.", 403);
  if (task.campaign_status === "paused") return fail("This campaign is paused. You can work on its tasks again when it resumes.");

  if (message && !isEmailChannel(task.step_channel)) return fail("Only an email step can record an email.");

  if (action === "reopen") {
    if (task.status !== "done" && task.status !== "skipped") return fail("Only a completed or skipped task can be reopened.");
    if (task.enrollment_status === "stopped") return fail("This campaign was stopped, so its tasks can't be reopened.");
  } else {
    if (task.status !== "pending") return fail("This task is already finished.");
    if (task.enrollment_status !== "active") return fail("This campaign is no longer active.");
  }

  let messageId: string | null = null;
  const label = `Day ${task.step_day}: ${task.step_title} (${task.step_channel})`;
  await withTransaction(async (client) => {
    if (action === "reopen") {
      await client.query("UPDATE campaign_tasks SET status = 'pending', completed_at = NULL, completed_by = NULL, notes = NULL WHERE id = $1", [id]);
      // Reopening says the step was not done after all, so the email recorded for it no longer counts as sent.
      await client.query("UPDATE campaign_messages SET status = 'void' WHERE task_id = $1 AND status = 'sent'", [id]);
      await client.query("UPDATE campaign_enrollments SET status = 'active', completed_at = NULL WHERE id = $1 AND status = 'completed'", [task.enrollment_id]);
    } else {
      await client.query(
        "UPDATE campaign_tasks SET status = $1, completed_at = now(), completed_by = $2, notes = $3 WHERE id = $4",
        [action === "done" ? "done" : "skipped", actor.id, notes || null, id]
      );
      const { rows } = await client.query("SELECT count(*)::int AS n FROM campaign_tasks WHERE enrollment_id = $1 AND status = 'pending'", [task.enrollment_id]);
      if (rows[0].n === 0) await client.query("UPDATE campaign_enrollments SET status = 'completed', completed_at = now() WHERE id = $1", [task.enrollment_id]);
      if (message) {
        messageId = (
          await client.query(
            `INSERT INTO campaign_messages (task_id, enrollment_id, campaign_id, company_id, contact_id, step_position, step_day, channel, subject, body, source, status, sent_by, sent_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'sent', $12, now()) RETURNING id`,
            [id, task.enrollment_id, task.campaign_id, task.company_id, task.contact_id, task.step_position, task.step_day, task.step_channel, message.subject, message.body, message.source, actor.id]
          )
        ).rows[0].id as string;
      }
    }

    const text =
      action === "done"
        ? `Campaign "${task.campaign_name}" for ${task.recipient_label} - ${label} done.${notes ? ` Notes: ${notes}` : ""}`
        : action === "skip"
          ? `Campaign "${task.campaign_name}" for ${task.recipient_label} - ${label} skipped. Reason: ${notes}`
          : `Campaign "${task.campaign_name}" for ${task.recipient_label} - ${label} reopened.`;
    await client.query(
      "INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body, metadata) VALUES ($1, $2, 'human', $3, $4, $5)",
      [task.company_id, action === "done" ? activityTypeFor(task.step_channel) : "note", actor.name, text, messageId ? JSON.stringify({ message_id: messageId }) : null]
    );
  });

  return NextResponse.json({ ok: true });
}

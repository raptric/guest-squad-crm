import { withTransaction } from "@/lib/db";
import { activityTypeFor, type TaskForAction } from "@/lib/campaigns";
import type { MessageSource } from "@/lib/campaign-messages-format";

export type SentMessage = { subject: string; body: string; signature?: string; source: MessageSource; gmailMessageId?: string | null };

// Tick a task off (done or skipped) or put it back (reopen), and write it on the company's activity timeline. When the last pending
// task of an enrollment is finished the enrollment is marked completed. On a done email step the email that was sent is recorded.
// The caller has already checked that the person may do this and that the task is in the right state.
export async function applyTaskAction(
  actor: { id: number | string; name: string },
  task: TaskForAction,
  action: "done" | "skip" | "reopen",
  notes: string,
  message: SentMessage | null,
): Promise<void> {
  const label = `Day ${task.step_day}: ${task.step_title} (${task.step_channel})`;
  let messageId: string | null = null;

  await withTransaction(async (client) => {
    if (action === "reopen") {
      await client.query("UPDATE campaign_tasks SET status = 'pending', completed_at = NULL, completed_by = NULL, notes = NULL WHERE id = $1", [task.id]);
      // Reopening says the step was not done after all, so the email recorded for it no longer counts as sent.
      await client.query("UPDATE campaign_messages SET status = 'void' WHERE task_id = $1 AND status = 'sent'", [task.id]);
      await client.query("UPDATE campaign_enrollments SET status = 'active', completed_at = NULL WHERE id = $1 AND status = 'completed'", [task.enrollment_id]);
    } else {
      await client.query("UPDATE campaign_tasks SET status = $1, completed_at = now(), completed_by = $2, notes = $3 WHERE id = $4", [action === "done" ? "done" : "skipped", actor.id, notes || null, task.id]);
      const { rows } = await client.query("SELECT count(*)::int AS n FROM campaign_tasks WHERE enrollment_id = $1 AND status = 'pending'", [task.enrollment_id]);
      if (rows[0].n === 0) await client.query("UPDATE campaign_enrollments SET status = 'completed', completed_at = now() WHERE id = $1", [task.enrollment_id]);
      await client.query("UPDATE campaign_messages SET status = 'void' WHERE task_id = $1 AND status = 'draft'", [task.id]);
      if (message) {
        messageId = (
          await client.query(
            `INSERT INTO campaign_messages (task_id, enrollment_id, campaign_id, company_id, contact_id, step_position, step_day, channel, subject, body, source, status, sent_by, sent_at, gmail_message_id, signature)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'sent', $12, now(), $13, $14) RETURNING id`,
            [task.id, task.enrollment_id, task.campaign_id, task.company_id, task.contact_id, task.step_position, task.step_day, task.step_channel, message.subject, message.body, message.source, actor.id, message.gmailMessageId ?? null, message.signature ?? ""],
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
    await client.query("INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body, metadata) VALUES ($1, $2, 'human', $3, $4, $5)", [
      task.company_id,
      action === "done" ? activityTypeFor(task.step_channel) : "note",
      actor.name,
      text,
      messageId ? JSON.stringify({ message_id: messageId }) : null,
    ]);
  });
}

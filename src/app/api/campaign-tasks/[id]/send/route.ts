import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { getTaskForAction } from "@/lib/campaigns";
import { isEmailChannel, leftoverPlaceholders, type MessageSource } from "@/lib/campaign-messages-format";
import { applyTaskAction } from "@/lib/campaign-task-actions";
import { getMailCredentials } from "@/lib/mail/account";
import { MailError, sendMail } from "@/lib/mail/gmail";
import { fetchSignature } from "@/lib/mail/signature";
import { emailHtml, mdToPlain } from "@/lib/rich-text";
import { dropTrailingName, effectiveSignature, withSignature } from "@/lib/signature-format";

const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

// A person's own Gmail has limits (and cold email from one inbox should stay modest), so this is the most the CRM sends for one person a day.
const MAX_SENDS_PER_DAY = 100;

// Send the email for one campaign task from the person's own Gmail, to the task's contact (or the company's general email), then mark
// the task done and keep the email.
//   { subject, body, source }
// Allowed for whoever may work the task and has added a Gmail login on their Profile.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);
  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid task");

  const b = (await request.json().catch(() => ({}))) as { subject?: unknown; body?: unknown; source?: unknown };
  const subject = typeof b.subject === "string" ? b.subject.replace(/\s+/g, " ").trim() : "";
  const text = typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").trim() : "";
  if (!subject) return fail("Write a subject line first.");
  if (subject.length > 300) return fail("The subject must be 300 characters or fewer.");
  if (!text) return fail("Write the email first.");
  if (text.length > 10000) return fail("The email must be 10,000 characters or fewer.");
  const left = leftoverPlaceholders(`${subject}\n${text}`);
  if (left.length) return fail(`The email still has ${left.join(", ")} to fill in.`);
  const source: MessageSource = (["baseline", "ai", "edited", "human"] as const).find((x) => x === b.source) ?? "human";

  const task = await getTaskForAction(actor, Number(id));
  if (!task) return fail("Task not found", 404);
  if (!task.allowed) return fail("This task belongs to someone else.", 403);
  if (!isEmailChannel(task.step_channel)) return fail("Only an email step can be sent.");
  if (task.status !== "pending") return fail("This task is already finished.");
  if (task.enrollment_status !== "active") return fail("This campaign is no longer active.");
  if (task.campaign_status === "paused") return fail("This campaign is paused. You can work on its tasks again when it resumes.");

  // who it goes to: the contact's email, or the company's general email
  const [to] = task.contact_id
    ? await query<{ email: string | null }>("SELECT (SELECT ce.email FROM contact_emails ce WHERE ce.contact_id = $1 ORDER BY ce.is_primary DESC NULLS LAST, ce.id LIMIT 1) AS email", [task.contact_id])
    : await query<{ email: string | null }>("SELECT email FROM companies WHERE id = $1", [task.company_id]);
  if (!to?.email) return fail(task.contact_id ? "This contact has no email address on file." : "This company has no general email address on file.");

  let creds: Awaited<ReturnType<typeof getMailCredentials>>;
  try {
    creds = await getMailCredentials(actor.id);
  } catch {
    return fail("Your saved Gmail password can't be read. Add it again on your Profile.", 500, { needs_setup: true });
  }
  if (!creds) return fail("Add your Gmail address and app password on your Profile first.", 409, { needs_setup: true });

  const [{ sent }] = await query<{ sent: number }>(
    "SELECT count(*)::int AS sent FROM campaign_messages WHERE sent_by = $1 AND gmail_message_id IS NOT NULL AND (sent_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date",
    [actor.id],
  );
  if (sent >= MAX_SENDS_PER_DAY) return fail(`You have sent ${MAX_SENDS_PER_DAY} emails from the CRM today, which is the daily limit. It restarts at midnight UTC.`, 429);

  // every email ends with the sender's signature; a sign-off name already at the end of the text would appear twice
  const signature = effectiveSignature(await fetchSignature(actor.id), actor.name);
  const written = dropTrailingName(text, [actor.name]);
  const full = withSignature(written, signature);
  let messageId = "";
  try {
    messageId = (await sendMail({ fromName: actor.name, fromAddress: creds.address, password: creds.password, to: to.email, subject, text: mdToPlain(full), html: emailHtml(full) })).messageId;
  } catch (e) {
    return fail(e instanceof MailError ? e.message : "The email could not be sent.", 502);
  }

  try {
    await applyTaskAction(actor, task, "done", `Emailed ${to.email} from ${creds.address}.`, { subject, body: written, signature, source, gmailMessageId: messageId.slice(0, 200) });
  } catch {
    return fail("The email was sent, but the CRM could not mark the step done. Mark it done by hand and paste the email there.", 500, { sent: true });
  }
  return NextResponse.json({ ok: true, to: to.email, from: creds.address });
}

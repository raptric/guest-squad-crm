import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getTaskForAction } from "@/lib/campaigns";
import { isEmailChannel, type MessageSource } from "@/lib/campaign-messages-format";
import { applyTaskAction, type SentMessage } from "@/lib/campaign-task-actions";

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
  let message: SentMessage | null = null;
  if (action === "done" && body.message) {
    const subject = typeof body.message.subject === "string" ? body.message.subject.replace(/\s+/g, " ").trim() : "";
    const text = typeof body.message.body === "string" ? body.message.body.replace(/\r\n/g, "\n").trim() : "";
    if (subject.length > 300) return fail("The subject must be 300 characters or fewer.");
    if (text.length > 10000) return fail("The email must be 10,000 characters or fewer.");
    const source: MessageSource = (["baseline", "ai", "edited", "human"] as const).find((x) => x === body.message?.source) ?? "human";
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

  await applyTaskAction(actor, task, action, notes, message);
  return NextResponse.json({ ok: true });
}

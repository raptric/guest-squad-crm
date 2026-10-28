import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction } from "@/lib/db";
import { activityTypeFor, getTaskForAction } from "@/lib/campaigns";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Tick a task off by hand: { action: "done" | "skip" | "reopen", notes? }.
//   done    optional notes
//   skip    needs a note (why)
//   reopen  undo a done / skipped task (mistakes happen)
// Allowed for the company's owner, the team lead (for their team's companies) and admins. Every action is recorded on
// the company's activity timeline; when the last pending task is finished the enrollment is marked completed.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);

  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid task");
  const body = (await request.json()) as { action?: string; notes?: unknown };
  const action = body.action;
  if (action !== "done" && action !== "skip" && action !== "reopen") return fail("action must be 'done', 'skip' or 'reopen'");
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length > 2000) return fail("Notes must be 2,000 characters or fewer.");
  if (action === "skip" && !notes) return fail("Add a short note saying why you're skipping this step.");

  const task = await getTaskForAction(actor, Number(id));
  if (!task) return fail("Task not found", 404);
  if (!task.allowed) return fail("This task belongs to someone else.", 403);
  if (task.campaign_status === "paused") return fail("This campaign is paused. You can work on its tasks again when it resumes.");

  if (action === "reopen") {
    if (task.status !== "done" && task.status !== "skipped") return fail("Only a completed or skipped task can be reopened.");
    if (task.enrollment_status === "stopped") return fail("This campaign was stopped, so its tasks can't be reopened.");
  } else {
    if (task.status !== "pending") return fail("This task is already finished.");
    if (task.enrollment_status !== "active") return fail("This campaign is no longer active.");
  }

  const label = `Day ${task.step_day}: ${task.step_title} (${task.step_channel})`;
  await withTransaction(async (client) => {
    if (action === "reopen") {
      await client.query("UPDATE campaign_tasks SET status = 'pending', completed_at = NULL, completed_by = NULL, notes = NULL WHERE id = $1", [id]);
      await client.query("UPDATE campaign_enrollments SET status = 'active', completed_at = NULL WHERE id = $1 AND status = 'completed'", [task.enrollment_id]);
    } else {
      await client.query(
        "UPDATE campaign_tasks SET status = $1, completed_at = now(), completed_by = $2, notes = $3 WHERE id = $4",
        [action === "done" ? "done" : "skipped", actor.id, notes || null, id]
      );
      const { rows } = await client.query("SELECT count(*)::int AS n FROM campaign_tasks WHERE enrollment_id = $1 AND status = 'pending'", [task.enrollment_id]);
      if (rows[0].n === 0) await client.query("UPDATE campaign_enrollments SET status = 'completed', completed_at = now() WHERE id = $1", [task.enrollment_id]);
    }

    const text =
      action === "done"
        ? `Campaign "${task.campaign_name}" for ${task.recipient_label} - ${label} done.${notes ? ` Notes: ${notes}` : ""}`
        : action === "skip"
          ? `Campaign "${task.campaign_name}" for ${task.recipient_label} - ${label} skipped. Reason: ${notes}`
          : `Campaign "${task.campaign_name}" for ${task.recipient_label} - ${label} reopened.`;
    await client.query(
      "INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body) VALUES ($1, $2, 'human', $3, $4)",
      [task.company_id, action === "done" ? activityTypeFor(task.step_channel) : "note", actor.name, text]
    );
  });

  return NextResponse.json({ ok: true });
}

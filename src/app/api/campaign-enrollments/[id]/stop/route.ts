import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction } from "@/lib/db";
import { getEnrollmentForAction } from "@/lib/campaigns";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Stop a running campaign for one recipient: its remaining tasks are cancelled. { note? }
// Allowed for the company's owner, the team lead (for their team's companies) and admins.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);

  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid enrollment");
  const raw = ((await request.json().catch(() => ({}))) as { note?: unknown }).note;
  const note = typeof raw === "string" ? raw.trim() : "";
  if (note.length > 2000) return fail("The note must be 2,000 characters or fewer.");

  const enrollment = await getEnrollmentForAction(actor, Number(id));
  if (!enrollment) return fail("Enrollment not found", 404);
  if (!enrollment.allowed) return fail("This campaign belongs to someone else.", 403);
  if (enrollment.status !== "active") return fail("This campaign has already finished.");

  const cancelled = await withTransaction(async (client) => {
    await client.query(
      "UPDATE campaign_enrollments SET status = 'stopped', stopped_at = now(), stopped_by = $1, stop_note = $2 WHERE id = $3",
      [actor.id, note || null, id]
    );
    const res = await client.query("UPDATE campaign_tasks SET status = 'cancelled' WHERE enrollment_id = $1 AND status = 'pending'", [id]);
    await client.query(
      "INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body) VALUES ($1, 'note', 'human', $2, $3)",
      [
        enrollment.company_id,
        actor.name,
        `Stopped the campaign "${enrollment.campaign_name}" for ${enrollment.recipient_label}. ${res.rowCount ?? 0} remaining ${res.rowCount === 1 ? "task" : "tasks"} cancelled.${note ? ` Note: ${note}` : ""}`,
      ]
    );
    return res.rowCount ?? 0;
  });

  return NextResponse.json({ ok: true, cancelled });
}

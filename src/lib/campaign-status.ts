import type { Client } from "pg";
import { withTransaction } from "@/lib/db";
import { activationError } from "@/lib/campaigns";

// Moving a campaign between Draft / Active / Paused / Completed.
//   draft -> active     needs the primary angle + pain point (and at least one step, which every campaign has)
//   active -> paused    its tasks are held (shown as Paused, never overdue)
//   paused -> active    resume: every pending task moves forward by the days the campaign was paused
//   active|paused -> completed
//        running enrollments? the caller must say what to do: "finish" (let them carry on, no new ones)
//        or "force_stop" (stop every running enrollment and cancel its remaining tasks)
//   completed is final (duplicate it to run it again)
export type StatusChange = { ok: true; running?: number; shifted_days?: number; stopped?: number } | { error: string; status: number; running?: number };

const ALLOWED: Record<string, string[]> = {
  draft: ["active"],
  active: ["paused", "completed"],
  paused: ["active", "completed"],
  completed: [],
};

// Moves every pending task of the campaign's running enrollments forward by the whole (UTC) days spent paused.
async function shiftPendingTasks(client: Client, campaignId: number, pausedAt: Date | null): Promise<number> {
  if (!pausedAt) return 0;
  const days = (await client.query("SELECT GREATEST(0, (now() AT TIME ZONE 'UTC')::date - ($1::timestamptz AT TIME ZONE 'UTC')::date)::int AS d", [pausedAt])).rows[0].d as number;
  if (days > 0) {
    await client.query(
      `UPDATE campaign_tasks t SET due_date = t.due_date + $2::int
         FROM campaign_enrollments e
        WHERE e.id = t.enrollment_id AND e.campaign_id = $1 AND e.status = 'active' AND t.status = 'pending'`,
      [campaignId, days]
    );
  }
  return days;
}

export async function changeCampaignStatus(
  actor: { id: number | string; name: string },
  campaignId: number,
  to: string,
  mode: string | undefined
): Promise<StatusChange> {
  return withTransaction<StatusChange>(async (client) => {
    const campaign = (
      await client.query(
        `SELECT id, name, status, paused_at, outreach_angle, pain_point,
                (SELECT count(*)::int FROM campaign_steps s WHERE s.campaign_id = campaigns.id) AS steps
           FROM campaigns WHERE id = $1 FOR UPDATE`,
        [campaignId]
      )
    ).rows[0];
    if (!campaign) return { error: "Campaign not found", status: 404 };
    if (!ALLOWED[campaign.status]?.includes(to)) {
      return { error: `A ${campaign.status} campaign can't be set to ${to}.`, status: 409 };
    }

    if (to === "active" && campaign.status === "draft") {
      const problem = activationError(campaign) ?? (campaign.steps ? null : "Add at least one step before activating.");
      if (problem) return { error: problem, status: 400 };
      await client.query("UPDATE campaigns SET status = 'active', updated_at = now() WHERE id = $1", [campaignId]);
      return { ok: true };
    }

    if (to === "paused") {
      await client.query("UPDATE campaigns SET status = 'paused', paused_at = now(), updated_at = now() WHERE id = $1", [campaignId]);
      return { ok: true };
    }

    if (to === "active") {
      // Resume: the pending tasks move forward by the days spent paused.
      const days = await shiftPendingTasks(client, campaignId, campaign.paused_at);
      await client.query("UPDATE campaigns SET status = 'active', paused_at = NULL, updated_at = now() WHERE id = $1", [campaignId]);
      return { ok: true, shifted_days: days };
    }

    // to === "completed"
    const running = (await client.query("SELECT count(*)::int AS n FROM campaign_enrollments WHERE campaign_id = $1 AND status = 'active'", [campaignId])).rows[0].n as number;
    if (running > 0 && mode !== "finish" && mode !== "force_stop") {
      return { error: `${running} ${running === 1 ? "company is" : "companies are"} still running this campaign. Choose what happens to them.`, status: 409, running };
    }
    let stopped = 0;
    if (running > 0 && mode === "force_stop") {
      const stoppedRows = (
        await client.query(
          `UPDATE campaign_enrollments SET status = 'stopped', stopped_at = now(), stopped_by = $2, stop_note = 'Campaign closed'
            WHERE campaign_id = $1 AND status = 'active' RETURNING id, company_id, recipient_label`,
          [campaignId, actor.id]
        )
      ).rows as { id: string; company_id: string; recipient_label: string }[];
      await client.query("UPDATE campaign_tasks SET status = 'cancelled' WHERE status = 'pending' AND enrollment_id = ANY($1::bigint[])", [stoppedRows.map((r) => r.id)]);
      for (const r of stoppedRows) {
        await client.query("INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body) VALUES ($1, 'note', 'human', $2, $3)", [
          r.company_id,
          actor.name,
          `The campaign "${campaign.name}" was closed, so it was stopped for ${r.recipient_label}. Remaining tasks cancelled.`,
        ]);
      }
      stopped = stoppedRows.length;
    }
    if (campaign.status === "paused" && mode === "finish") await shiftPendingTasks(client, campaignId, campaign.paused_at);
    await client.query("UPDATE campaigns SET status = 'completed', paused_at = NULL, updated_at = now() WHERE id = $1", [campaignId]);
    return { ok: true, running: mode === "finish" ? running : 0, stopped };
  });
}

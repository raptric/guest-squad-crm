"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The status buttons for a campaign you manage:
//   Draft    -> Activate
//   Active   -> Pause, Stop, Complete
//   Paused   -> Resume, Stop, Complete
//   Pause    holds the tasks; Resume moves their due dates forward by the days paused.
//   Complete closes the campaign to new companies; companies still running it carry on to the end.
//   Stop     closes it AND stops every company still running it (their remaining tasks are cancelled).
export function CampaignStatusActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<null | { kind: "stop" } | { kind: "complete"; running: number }>(null);

  async function send(to: "active" | "paused" | "completed", mode?: "finish" | "force_stop") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: to, mode }),
    });
    setBusy(false);
    const body = await res.json().catch(() => ({}));
    // Completing with companies still running: ask once, then it's "let them finish".
    if (res.status === 409 && typeof body.running === "number") {
      setPanel({ kind: "complete", running: body.running });
      return;
    }
    if (!res.ok) {
      setError(body.error ?? "Couldn't change the status");
      return;
    }
    setPanel(null);
    router.refresh();
  }

  if (status === "completed") return null;
  const btn = "rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";
  const stopBtn = "rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {status === "draft" && (
          <button disabled={busy} onClick={() => send("active")} className={btn} title="Open the campaign for enrollment">
            Activate
          </button>
        )}
        {status === "active" && (
          <button disabled={busy} onClick={() => send("paused")} className={btn} title="Hold its tasks. No new companies can be enrolled while paused.">
            Pause
          </button>
        )}
        {status === "paused" && (
          <button disabled={busy} onClick={() => send("active")} className={btn} title="Resume: pending due dates move forward by the days paused">
            Resume
          </button>
        )}
        {(status === "active" || status === "paused") && (
          <>
            <button disabled={busy} onClick={() => setPanel({ kind: "stop" })} className={stopBtn} title="Close the campaign and stop every company still running it">
              Stop
            </button>
            <button disabled={busy} onClick={() => send("completed")} className={btn} title="Close the campaign to new companies. Companies still running it carry on.">
              Complete
            </button>
          </>
        )}
      </div>

      {panel?.kind === "stop" && (
        <div className="w-72 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-left text-xs text-zinc-700">
          <p>
            <strong>Stop this campaign?</strong> It closes, every company still running it is stopped, and their remaining tasks are cancelled. This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => send("completed", "force_stop")} className="rounded-lg bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {busy ? "Stopping…" : "Stop campaign"}
            </button>
            <button onClick={() => setPanel(null)} className="rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {panel?.kind === "complete" && (
        <div className="w-72 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-zinc-700">
          <p>
            <strong>{panel.running}</strong> {panel.running === 1 ? "company is" : "companies are"} still running this campaign. Completing closes it to new companies;
            the running {panel.running === 1 ? "one carries" : "ones carry"} on to the end. (To end them now, use Stop.)
          </p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => send("completed", "finish")} className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
              {busy ? "Completing…" : "Complete"}
            </button>
            <button onClick={() => setPanel(null)} className="rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}

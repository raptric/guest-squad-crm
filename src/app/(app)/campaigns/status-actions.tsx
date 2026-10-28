"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Activate / Pause / Resume / Complete for a campaign you manage. Completing with companies still running asks
// what to do with them: let them finish (no new ones can join), or stop them all.
export function CampaignStatusActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<number | null>(null);

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
    if (res.status === 409 && typeof body.running === "number") {
      setRunning(body.running);
      return;
    }
    if (!res.ok) {
      setError(body.error ?? "Couldn't change the status");
      return;
    }
    setRunning(null);
    router.refresh();
  }

  if (status === "completed") return null;
  const btn = "rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {status === "draft" && (
          <button disabled={busy} onClick={() => send("active")} className={btn}>
            Activate
          </button>
        )}
        {status === "active" && (
          <button disabled={busy} onClick={() => send("paused")} className={btn}>
            Pause
          </button>
        )}
        {status === "paused" && (
          <button disabled={busy} onClick={() => send("active")} className={btn}>
            Resume
          </button>
        )}
        {(status === "active" || status === "paused") && (
          <button disabled={busy} onClick={() => send("completed")} className={btn}>
            Complete
          </button>
        )}
      </div>
      {running !== null && (
        <div className="w-72 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-zinc-700">
          <p>
            <strong>{running}</strong> {running === 1 ? "company is" : "companies are"} still running this campaign. What should happen to {running === 1 ? "it" : "them"}?
          </p>
          <button disabled={busy} onClick={() => send("completed", "finish")} className="block w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-left font-medium hover:bg-zinc-50 disabled:opacity-50">
            Complete, let the running ones finish
            <span className="block font-normal text-zinc-500">No new companies can join.</span>
          </button>
          <button disabled={busy} onClick={() => send("completed", "force_stop")} className="block w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-left font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
            Complete and stop all {running}
            <span className="block font-normal text-zinc-500">Their remaining tasks are cancelled.</span>
          </button>
          <button onClick={() => setRunning(null)} className="text-zinc-500 underline hover:text-zinc-800">
            Cancel
          </button>
        </div>
      )}
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}

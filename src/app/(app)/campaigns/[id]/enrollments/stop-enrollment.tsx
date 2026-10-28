"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Stop one running enrollment (its remaining tasks are cancelled), with an optional note. The server decides who may:
// the company's owner, the team lead for their team's companies, and admins.
export function StopEnrollment({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function stop() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaign-enrollments/${enrollmentId}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't stop it");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
        Stop
      </button>
    );
  }
  return (
    <div className="w-56 space-y-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-left text-xs text-zinc-700">
      <textarea
        autoFocus
        rows={2}
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Why? (optional) e.g. replied, not interested"
        className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-xs focus:border-sky-500 focus:outline-none"
      />
      {error && <p className="text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={stop} disabled={busy} className="rounded-lg bg-red-600 px-2.5 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50">
          {busy ? "Stopping…" : "Stop it"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg px-2.5 py-1 text-zinc-600 hover:bg-white">
          Cancel
        </button>
      </div>
      <p className="text-zinc-500">Remaining tasks are cancelled.</p>
    </div>
  );
}

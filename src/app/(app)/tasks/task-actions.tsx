"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "../icons";

// Done / Skip / Undo for one task, with a short notes box. Used on the My tasks page and on the company page.
export function TaskActions({ taskId, status, canAct }: { taskId: string; status: string; canAct: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"done" | "skip" | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canAct || status === "cancelled") return null;

  async function send(action: "done" | "skip" | "reopen") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaign-tasks/${taskId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, notes }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't save");
      return;
    }
    setMode(null);
    setNotes("");
    router.refresh();
  }

  if (status === "done" || status === "skipped") {
    return (
      <div className="text-right">
        <button onClick={() => send("reopen")} disabled={busy} className="text-xs text-zinc-500 underline hover:text-zinc-800 disabled:opacity-50">
          {busy ? "..." : "Undo"}
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (!mode) {
    return (
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => setMode("done")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
        >
          <CheckIcon className="h-4 w-4" />
          Done
        </button>
        <button onClick={() => setMode("skip")} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
          Skip
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2 sm:w-80">
      <textarea
        autoFocus
        rows={2}
        maxLength={2000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={mode === "done" ? "Notes (optional): what happened, what was said…" : "Why are you skipping this step? (required)"}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => send(mode)}
          disabled={busy || (mode === "skip" && !notes.trim())}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-sm disabled:opacity-40 ${mode === "done" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-zinc-800 hover:bg-zinc-900"}`}
        >
          {busy ? "Saving..." : mode === "done" ? "Mark done" : "Skip step"}
        </button>
        <button
          onClick={() => {
            setMode(null);
            setNotes("");
            setError(null);
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

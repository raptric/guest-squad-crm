"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "../icons";
import { isEmailChannel, messageSource } from "@/lib/campaign-messages-format";
import { getEmailDraft, setEmailDraft } from "./email-draft-store";

// Done / Skip / Undo for one task, with a short notes box. Used on the My tasks page and on the company page. On an email step,
// Done also asks the person to confirm the email they sent, so the CRM keeps it.
export function TaskActions({ taskId, status, canAct, channel }: { taskId: string; status: string; canAct: boolean; channel?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"done" | "skip" | null>(null);
  const [notes, setNotes] = useState("");
  const isEmail = Boolean(channel && isEmailChannel(channel));
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canAct || status === "cancelled") return null;

  function openDone() {
    const draft = getEmailDraft(taskId);
    setMsgSubject(draft?.subject ?? "");
    setMsgBody(draft?.body ?? "");
    setMode("done");
  }

  async function send(action: "done" | "skip" | "reopen") {
    setBusy(true);
    setError(null);
    const draft = getEmailDraft(taskId);
    const message =
      action === "done" && isEmail && msgBody.trim()
        ? {
            subject: msgSubject,
            body: msgBody,
            source: messageSource({ subject: msgSubject, body: msgBody }, draft ? { origin: draft.origin, subject: draft.startedSubject, body: draft.startedBody } : null),
          }
        : undefined;
    const res = await fetch(`/api/campaign-tasks/${taskId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, notes, message }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't save");
      return;
    }
    setMode(null);
    setNotes("");
    if (action === "done") setEmailDraft(taskId, null);
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
          onClick={openDone}
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
      {mode === "done" && isEmail && (
        <div className="space-y-1.5 rounded-lg border border-sky-200 bg-sky-50/50 p-2.5">
          <p className="text-xs font-medium text-zinc-700">The email you sent</p>
          <p className="text-xs text-zinc-500">Confirm or paste what you sent, so the next follow-up knows what was said. Leave it empty to record nothing.</p>
          <input value={msgSubject} maxLength={300} onChange={(e) => setMsgSubject(e.target.value)} placeholder="Subject" className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" />
          <textarea rows={7} maxLength={10000} value={msgBody} onChange={(e) => setMsgBody(e.target.value)} placeholder="The email" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" />
        </div>
      )}
      <textarea
        autoFocus={!(mode === "done" && isEmail)}
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

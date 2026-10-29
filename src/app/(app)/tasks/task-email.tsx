"use client";

import { useState } from "react";
import { fillPlaceholders, leftoverPlaceholders, type TaskMail } from "@/lib/campaign-messages-format";
import { getEmailDraft, setEmailDraft } from "./email-draft-store";

const field = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const SOURCE_TEXT = { baseline: "the campaign's baseline", ai: "AI", edited: "the baseline, edited", human: "written by hand" } as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

// The email of an Initial Email or Follow-up Email task: the campaign's baseline, a box to prepare the email in, and, once the
// task is done, the email that was sent. What is typed here is confirmed when the task is marked done.
export function TaskEmail({ taskId, status, canAct, mail, senderName }: { taskId: string; status: string; canAct: boolean; mail: TaskMail; senderName: string }) {
  const existing = getEmailDraft(taskId);
  const [open, setOpen] = useState(Boolean(existing));
  const [subject, setSubject] = useState(existing?.subject ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const hasBaseline = Boolean(mail.baseline_body.trim());

  // Done: show the email that was sent.
  if (status === "done") {
    if (!mail.sent) return null;
    return (
      <details className="rounded-lg border border-zinc-200 bg-white p-2.5 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-sky-700">
          Email sent{mail.sent.by ? ` by ${mail.sent.by}` : ""}
          {mail.sent.at ? `, ${when(mail.sent.at)}` : ""} · from {SOURCE_TEXT[mail.sent.source]}
        </summary>
        {mail.sent.subject && <p className="mt-2 font-medium text-zinc-900">Subject: {mail.sent.subject}</p>}
        <p className="mt-1 whitespace-pre-wrap text-zinc-700">{mail.sent.body}</p>
      </details>
    );
  }
  if (status !== "pending" || !canAct) return null;

  const fill = (t: string) => fillPlaceholders(t, { first_name: mail.first_name, company_name: mail.company_name, city: mail.city, sender_name: senderName });

  function start(from: "baseline" | "human") {
    const s = from === "baseline" ? fill(mail.baseline_subject) : "";
    const b = from === "baseline" ? fill(mail.baseline_body) : "";
    setSubject(s);
    setBody(b);
    setOpen(true);
    setEmailDraft(taskId, { subject: s, body: b, origin: from, startedSubject: s, startedBody: b });
  }

  function edit(next: { subject?: string; body?: string }) {
    const s = next.subject ?? subject;
    const b = next.body ?? body;
    setSubject(s);
    setBody(b);
    const prev = getEmailDraft(taskId);
    setEmailDraft(taskId, { subject: s, body: b, origin: prev?.origin ?? "human", startedSubject: prev?.startedSubject ?? "", startedBody: prev?.startedBody ?? "" });
  }

  function close() {
    setOpen(false);
    setSubject("");
    setBody("");
    setEmailDraft(taskId, null);
  }

  async function copy(what: "subject" | "email") {
    await navigator.clipboard.writeText(what === "subject" ? subject : body).catch(() => {});
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  const leftover = leftoverPlaceholders(`${subject}\n${body}`);
  const mailto = mail.to_email ? `mailto:${encodeURIComponent(mail.to_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, "\r\n"))}` : null;

  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-700">Email</span>
        {hasBaseline && (
          <button type="button" onClick={() => setShowOriginal((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50" title="The email written for this step of the campaign">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5" aria-hidden>
              <path d="M5 2.5h7l3 3v12H5z" strokeLinejoin="round" />
              <path d="M8 9h4M8 12h4" strokeLinecap="round" />
            </svg>
            Original copy
          </button>
        )}
        {!open && hasBaseline && (
          <button type="button" onClick={() => start("baseline")} className="rounded-md bg-sky-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-800">
            Use baseline
          </button>
        )}
        {!open && (
          <button type="button" onClick={() => start("human")} className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
            {hasBaseline ? "Write it myself" : "Write the email"}
          </button>
        )}
        {!hasBaseline && !open && <span className="text-xs text-zinc-400">This step has no baseline email.</span>}
      </div>

      {showOriginal && hasBaseline && (
        <div className="rounded-lg bg-zinc-50 p-3 text-sm">
          <p className="text-xs text-zinc-500">As written for the campaign. The names in curly braces are filled in when you use it.</p>
          {mail.baseline_subject && <p className="mt-1 font-medium text-zinc-900">Subject: {mail.baseline_subject}</p>}
          <p className="mt-1 whitespace-pre-wrap text-zinc-700">{mail.baseline_body}</p>
        </div>
      )}

      {open && (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Subject</span>
            <input value={subject} maxLength={300} onChange={(e) => edit({ subject: e.target.value })} className={field} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-500">Email</span>
            <textarea rows={10} maxLength={10000} value={body} onChange={(e) => edit({ body: e.target.value })} className={field} />
          </label>
          {leftover.length > 0 && <p className="text-xs text-amber-700">Still to fill in: {leftover.join(", ")}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => copy("subject")} className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              {copied === "subject" ? "Copied" : "Copy subject"}
            </button>
            <button type="button" onClick={() => copy("email")} className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              {copied === "email" ? "Copied" : "Copy email"}
            </button>
            {mailto && (
              <a href={mailto} className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                Open in my email app
              </a>
            )}
            <button type="button" onClick={close} className="ml-auto text-xs text-zinc-500 hover:text-zinc-800">
              Discard
            </button>
          </div>
          <p className="text-xs text-zinc-500">Send it from your own mail, then click Done. You will be asked to confirm what you sent, so the next follow-up knows what was said.</p>
        </div>
      )}
    </div>
  );
}

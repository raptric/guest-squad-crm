"use client";

import { useState } from "react";
import { diffWords, fillPlaceholders, leftoverPlaceholders, type MailDraft, type TaskMail } from "@/lib/campaign-messages-format";
import { getEmailDraft, setEmailDraft } from "./email-draft-store";

const field = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const SOURCE_TEXT = { baseline: "the campaign's baseline", ai: "AI", edited: "the baseline or AI draft, edited", human: "written by hand" } as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

type Written = MailDraft & { words: number; warnings: string[] };

// The email of an Initial Email or Follow-up Email task: the campaign's baseline, the AI's drafts for this company, a box to
// prepare the email in, and, once the task is done, the email that was sent. What is in the box is confirmed when the task is
// marked done.
export function TaskEmail({ taskId, status, canAct, mail, senderName }: { taskId: string; status: string; canAct: boolean; mail: TaskMail; senderName: string }) {
  const existing = getEmailDraft(taskId);
  const [open, setOpen] = useState(Boolean(existing));
  const [subject, setSubject] = useState(existing?.subject ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [showOriginal, setShowOriginal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // the AI's drafts for this company: the ones already saved on the task, or the ones just written
  const [drafts, setDrafts] = useState<Written[]>(mail.drafts.map((d) => ({ ...d, words: d.body.split(/\s+/).filter(Boolean).length, warnings: [] })));
  const [showDrafts, setShowDrafts] = useState(mail.drafts.length > 0 && !existing);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [thin, setThin] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [askInstruction, setAskInstruction] = useState(false);

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
  const baselineBody = hasBaseline ? fill(mail.baseline_body) : "";

  function start(from: "baseline" | "ai" | "human", text?: { subject: string; body: string }) {
    const s = text ? text.subject : from === "baseline" ? fill(mail.baseline_subject) : "";
    const b = text ? text.body : from === "baseline" ? fill(mail.baseline_body) : "";
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

  async function write() {
    setWriting(true);
    setWriteError(null);
    const res = await fetch(`/api/campaign-tasks/${taskId}/write`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction }) });
    setWriting(false);
    const data = (await res.json().catch(() => ({}))) as { versions?: (Omit<Written, "at">)[]; remaining?: number; thin?: boolean; error?: string };
    if (!res.ok || !data.versions) {
      setWriteError(data.error ?? "Couldn't write the email");
      return;
    }
    setDrafts(data.versions.map((v) => ({ ...v, at: new Date().toISOString() })));
    setRemaining(data.remaining ?? null);
    setThin(Boolean(data.thin));
    setShowDrafts(true);
  }

  const leftover = leftoverPlaceholders(`${subject}\n${body}`);
  const mailto = mail.to_email ? `mailto:${encodeURIComponent(mail.to_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, "\r\n"))}` : null;
  const fresh = remaining !== null;

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
        <button type="button" onClick={write} disabled={writing} className="rounded-md bg-violet-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-800 disabled:opacity-60">
          {writing ? "Writing…" : drafts.length ? "Write again" : "Write for this company"}
        </button>
        {!askInstruction && (
          <button type="button" onClick={() => setAskInstruction(true)} className="text-xs text-zinc-500 hover:text-zinc-800">
            Add an instruction
          </button>
        )}
        {!open && (
          <button type="button" onClick={() => start("human")} className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
            Write it myself
          </button>
        )}
        {!hasBaseline && !open && <span className="text-xs text-zinc-400">This step has no baseline email.</span>}
      </div>

      {askInstruction && (
        <input value={instruction} maxLength={300} onChange={(e) => setInstruction(e.target.value)} placeholder="Anything specific? e.g. shorter, mention their Booking.com rating" className={field} />
      )}
      {writeError && <p className="text-sm text-red-600">{writeError}</p>}

      {showOriginal && hasBaseline && (
        <div className="rounded-lg bg-zinc-50 p-3 text-sm">
          <p className="text-xs text-zinc-500">As written for the campaign. The names in curly braces are filled in when you use it.</p>
          {mail.baseline_subject && <p className="mt-1 font-medium text-zinc-900">Subject: {mail.baseline_subject}</p>}
          <p className="mt-1 whitespace-pre-wrap text-zinc-700">{mail.baseline_body}</p>
        </div>
      )}

      {drafts.length > 0 && !showDrafts && (
        <button type="button" onClick={() => setShowDrafts(true)} className="text-xs font-medium text-violet-700 hover:underline">
          Show the AI {drafts.length === 1 ? "draft" : "drafts"} ({drafts.length})
        </button>
      )}

      {drafts.length > 0 && showDrafts && (
        <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-700">
              {fresh ? "Written for this company" : `Saved ${drafts.length === 1 ? "draft" : "drafts"}, written ${when(drafts[0].at)}`}
              {hasBaseline && <span className="ml-2 font-normal text-zinc-500">Green shows what changed from the baseline.</span>}
            </p>
            <button type="button" onClick={() => setShowDrafts(false)} className="text-xs text-zinc-500 hover:text-zinc-800">
              Hide
            </button>
          </div>
          {thin && <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">The CRM has few facts about this company, so the email stays close to the baseline.</p>}
          <div className={`grid gap-3 ${drafts.length > 1 ? "xl:grid-cols-2" : ""}`}>
            {drafts.map((d, i) => {
              const warn = [...new Set([...d.warnings, ...leftoverPlaceholders(`${d.subject}\n${d.body}`).map((p) => `Still has ${p} to fill in.`)])];
              return (
                <article key={d.id} className="flex flex-col rounded-lg border border-zinc-200 bg-white p-3">
                  <p className="text-xs font-medium text-zinc-500">
                    {drafts.length > 1 ? `Version ${i + 1} · ` : ""}
                    {d.words} words
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">{d.subject || "(no subject)"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">
                    {hasBaseline
                      ? diffWords(baselineBody, d.body).map((seg, k) =>
                          seg.changed ? (
                            <mark key={k} className="rounded bg-emerald-100 px-0.5 text-zinc-900">
                              {seg.text}
                            </mark>
                          ) : (
                            <span key={k}>{seg.text}</span>
                          ),
                        )
                      : d.body}
                  </p>
                  {d.facts_used.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-zinc-500">Facts it used</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {d.facts_used.map((f) => (
                          <span key={f} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {d.notes && <p className="mt-2 text-xs text-amber-800">{d.notes}</p>}
                  {warn.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-amber-700">
                      {warn.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      start("ai", { subject: d.subject, body: d.body });
                      setShowDrafts(false);
                    }}
                    className="mt-3 self-start rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Use this version
                  </button>
                </article>
              );
            })}
          </div>
          {fresh && <p className="text-xs text-zinc-400">{remaining} AI {remaining === 1 ? "write" : "writes"} left today. The drafts are saved on this task.</p>}
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

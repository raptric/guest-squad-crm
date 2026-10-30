"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { diffWords, fillPlaceholders, leftoverPlaceholders, messageSource, type MailDraft, type TaskMail } from "@/lib/campaign-messages-format";
import { dropTrailingName, withSignature } from "@/lib/signature-format";
import { TestEmail } from "@/components/test-email";
import { RichEditor } from "@/components/rich-editor";
import { MdText } from "@/components/md-text";
import { mdToHtml, mdToPlain } from "@/lib/rich-text";
import { getEmailDraft, setEmailDraft } from "./email-draft-store";
import { TaskActions } from "./task-actions";

const field = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const SOURCE_TEXT = { baseline: "the campaign's baseline", ai: "AI", edited: "the baseline or AI draft, edited", human: "written by hand" } as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const KNOWN = ["{first_name}", "{company_name}", "{city}", "{sender_name}"];

type Written = MailDraft & { words: number; warnings: string[] };

const Link2 = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline">
    {children}
  </button>
);

// The working area of an Initial Email or Follow-up Email task, from top to bottom:
//   1. start from: the baseline, an AI draft for this company, or a blank page (plus small links to see the baseline, add an instruction)
//   2. the AI's drafts, with what they changed from the baseline
//   3. the email itself: to, from, subject, text, copy tools
//   4. one row of actions: Send email, and Done / Skip
// Once the task is done it shows the email that was sent instead.
export function TaskEmail({
  taskId,
  status,
  channel,
  canAct,
  mail,
  senderName,
  senderEmail,
  signature,
}: {
  taskId: string;
  status: string;
  channel: string;
  canAct: boolean;
  mail: TaskMail;
  senderName: string;
  senderEmail: string | null;
  signature: string;
}) {
  const router = useRouter();
  const existing = getEmailDraft(taskId);
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
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
        <MdText text={withSignature(mail.sent.body, mail.sent.signature)} className="mt-1 text-zinc-700" />
      </details>
    );
  }
  if (status !== "pending" || !canAct) return null;

  const fill = (t: string) => fillPlaceholders(t, { first_name: mail.first_name, company_name: mail.company_name, city: mail.city, sender_name: senderName });
  const baselineBody = hasBaseline ? fill(mail.baseline_body) : "";
  // A draft that still has a name in curly braces (the AI sometimes copies one from the baseline) is shown, and used, with the name filled in.
  const filledDrafts = drafts.map((d) => ({ ...d, subject: fill(d.subject), body: fill(d.body) }));

  function start(from: "baseline" | "ai" | "human", text?: { subject: string; body: string }) {
    const s = text ? text.subject : from === "baseline" ? fill(mail.baseline_subject) : "";
    const b = dropTrailingName(text ? text.body : from === "baseline" ? fill(mail.baseline_body) : "", [senderName]);
    setSubject(s);
    setBody(b);
    setOpen(true);
    setConfirmSend(false);
    setEmailDraft(taskId, { subject: s, body: b, origin: from, startedSubject: s, startedBody: b });
  }

  function edit(next: { subject?: string; body?: string }) {
    const s = next.subject ?? subject;
    const b = next.body ?? body;
    setSubject(s);
    setBody(b);
    setConfirmSend(false);
    const prev = getEmailDraft(taskId);
    setEmailDraft(taskId, { subject: s, body: b, origin: prev?.origin ?? "human", startedSubject: prev?.startedSubject ?? "", startedBody: prev?.startedBody ?? "" });
  }

  function close() {
    setOpen(false);
    setConfirmSend(false);
    setSubject("");
    setBody("");
    setEmailDraft(taskId, null);
  }

  async function copy(what: "subject" | "email") {
    if (what === "subject") await navigator.clipboard.writeText(subject).catch(() => {});
    else {
      const full = withSignature(body, signature);
      // the formatted version for an email window, the plain one for anywhere else
      await navigator.clipboard
        .write([new ClipboardItem({ "text/html": new Blob([mdToHtml(full)], { type: "text/html" }), "text/plain": new Blob([mdToPlain(full)], { type: "text/plain" }) })])
        .catch(() => navigator.clipboard.writeText(mdToPlain(full)).catch(() => {}));
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  }

  async function write() {
    setWriting(true);
    setWriteError(null);
    const res = await fetch(`/api/campaign-tasks/${taskId}/write`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instruction }) });
    setWriting(false);
    const data = (await res.json().catch(() => ({}))) as { versions?: Omit<Written, "at">[]; remaining?: number; thin?: boolean; error?: string };
    if (!res.ok || !data.versions) {
      setWriteError(data.error ?? "Couldn't write the email");
      return;
    }
    setDrafts(data.versions.map((v) => ({ ...v, at: new Date().toISOString() })));
    setRemaining(data.remaining ?? null);
    setThin(Boolean(data.thin));
    setShowDrafts(true);
  }

  async function send() {
    setSending(true);
    setSendError(null);
    const draft = getEmailDraft(taskId);
    const res = await fetch(`/api/campaign-tasks/${taskId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, source: messageSource({ subject, body }, draft ? { origin: draft.origin, subject: draft.startedSubject, body: draft.startedBody } : null) }),
    });
    setSending(false);
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setSendError(data.error ?? "The email could not be sent");
      return;
    }
    setEmailDraft(taskId, null);
    setConfirmSend(false);
    router.refresh();
  }

  const leftover = leftoverPlaceholders(`${subject}\n${body}`);
  const words = body.split(/\s+/).filter(Boolean).length;
  const mailto = mail.to_email ? `mailto:${encodeURIComponent(mail.to_email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mdToPlain(withSignature(body, signature)).replace(/\n/g, "\r\n"))}` : null;
  const fresh = remaining !== null;
  const canSend = Boolean(senderEmail && mail.to_email);
  const ready = Boolean(subject.trim() && body.trim() && leftover.length === 0);

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
      {/* 1. start from */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Email</span>
        {hasBaseline && !open && (
          <button type="button" onClick={() => start("baseline")} className="rounded-lg bg-sky-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-sky-800">
            Use baseline
          </button>
        )}
        <button type="button" onClick={write} disabled={writing} className="rounded-lg bg-violet-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-800 disabled:opacity-60">
          {writing ? "Writing…" : drafts.length ? "Write again" : "Write for this company"}
        </button>
        {!open && (
          <button type="button" onClick={() => start("human")} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Write it myself
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {hasBaseline && <Link2 onClick={() => setShowOriginal((v) => !v)}>{showOriginal ? "Hide baseline" : "View baseline"}</Link2>}
          {!askInstruction && <Link2 onClick={() => setAskInstruction(true)}>Add an instruction</Link2>}
          {drafts.length > 0 && !showDrafts && <Link2 onClick={() => setShowDrafts(true)}>{`Show AI ${drafts.length === 1 ? "draft" : "drafts"} (${drafts.length})`}</Link2>}
        </span>
      </div>
      {!hasBaseline && !open && <p className="-mt-1 text-xs text-zinc-400">This step has no baseline email, so the AI writes from the campaign and what the CRM knows about the company.</p>}

      {askInstruction && <input value={instruction} maxLength={300} onChange={(e) => setInstruction(e.target.value)} placeholder="Anything specific for the AI? e.g. shorter, mention their Booking.com rating" className={field} />}
      {writeError && <p className="text-sm text-red-600">{writeError}</p>}

      {showOriginal && hasBaseline && (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
          <p className="text-xs text-zinc-500">The baseline as written for the campaign. The names in curly braces are filled in when you use it.</p>
          {mail.baseline_subject && <p className="mt-1 font-medium text-zinc-900">Subject: {mail.baseline_subject}</p>}
          <MdText text={mail.baseline_body} className="mt-1 text-zinc-700" />
        </div>
      )}

      {/* 2. the AI's drafts */}
      {drafts.length > 0 && showDrafts && (
        <div className="space-y-2 rounded-lg border border-violet-200 bg-white p-3">
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
            {filledDrafts.map((d, i) => {
              const warn = [...new Set([...d.warnings, ...leftoverPlaceholders(`${d.subject}\n${d.body}`).map((p) => `Still has ${p} to fill in.`)])];
              return (
                <article key={d.id} className="flex flex-col rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
                  <p className="text-xs font-medium text-zinc-500">
                    {drafts.length > 1 ? `Version ${i + 1} · ` : ""}
                    {d.words} words
                  </p>
                  <p className="mt-1 text-sm font-medium text-zinc-900">{d.subject || "(no subject)"}</p>
                  <MdText segments={hasBaseline ? diffWords(baselineBody, d.body) : undefined} text={d.body} className="mt-1 text-sm text-zinc-700" />
                  {d.facts_used.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-medium text-zinc-500">Facts it used:</span>
                      {d.facts_used.map((f) => (
                        <span key={f} className="rounded-full bg-white px-2 py-0.5 text-xs text-zinc-700 ring-1 ring-zinc-200">
                          {f}
                        </span>
                      ))}
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

      {/* 3. the email */}
      {open && (
        <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500">
            <span>
              To <span className="font-medium text-zinc-800">{mail.to_email || "no email on file"}</span>
            </span>
            {senderEmail && (
              <span>
                From <span className="font-medium text-zinc-800">{senderEmail}</span>
              </span>
            )}
          </div>
          <input value={subject} maxLength={300} onChange={(e) => edit({ subject: e.target.value })} placeholder="Subject" aria-label="Subject" className={`${field} font-medium`} />
          <RichEditor value={body} onChange={(b) => edit({ body: b })} placeholder="The email" ariaLabel="Email" minHeight="14rem" />
          {signature && (
            <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/70 px-3 py-2">
              <MdText text={signature} className="text-sm text-zinc-500" />
              <p className="mt-1 text-xs text-zinc-400">
                Your signature, added when the email is sent. <Link href="/profile" className="text-sky-700 hover:underline">Change it on your Profile</Link>
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-400">{words} words</span>
            {leftover.length > 0 && (
              <span className="text-xs text-amber-700">
                Still to fill in: {leftover.join(", ")}
                {leftover.some((p) => KNOWN.includes(p)) && (
                  <button type="button" onClick={() => edit({ subject: fill(subject), body: fill(body) })} className="ml-2 rounded-md border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-50">
                    Fill in the names
                  </button>
                )}
              </span>
            )}
            <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link2 onClick={() => copy("subject")}>{copied === "subject" ? "Copied" : "Copy subject"}</Link2>
              <Link2 onClick={() => copy("email")}>{copied === "email" ? "Copied" : "Copy email"}</Link2>
              {mailto && (
                <a href={mailto} className="text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline">
                  Open in my email app
                </a>
              )}
              <TestEmail getEmail={() => ({ subject, body })} defaultTo={senderEmail ?? ""} />
              <Link2 onClick={close}>Discard</Link2>
            </span>
          </div>
        </div>
      )}

      {/* 4. the actions, in one place */}
      {confirmSend && open && canSend && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-sm text-zinc-800">
            Send this email now from <span className="font-medium">{senderEmail}</span> to <span className="font-medium">{mail.to_email}</span>? The step is marked done and a copy stays in your Gmail Sent folder.
          </p>
          {sendError && <p className="text-sm text-red-600">{sendError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={send} disabled={sending} className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {sending ? "Sending…" : "Send now"}
            </button>
            <button type="button" onClick={() => setConfirmSend(false)} disabled={sending} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-3 border-t border-zinc-200 pt-3">
        {open && canSend && !confirmSend && (
          <button type="button" onClick={() => setConfirmSend(true)} disabled={!ready} title={ready ? "" : "Add a subject and the email, and fill in any names in curly braces"} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-40">
            Send email
          </button>
        )}
        {open && !canSend && (
          <p className="max-w-md text-xs text-zinc-500">
            {!senderEmail ? (
              <>
                To send from here, <Link href="/profile" className="text-sky-700 hover:underline">add your Gmail and app password on your Profile</Link>. Or send it yourself, then click Done and confirm what you sent.
              </>
            ) : (
              "This contact has no email address on file. Send it another way, then click Done and confirm what you sent."
            )}
          </p>
        )}
        {!open && <p className="max-w-sm text-xs text-zinc-500">Pick how to start. Done and Skip are here when you handle it another way.</p>}
        <div className="ml-auto">
          <TaskActions taskId={taskId} status={status} channel={channel} canAct />
        </div>
      </div>
      {open && canSend && <p className="text-xs text-zinc-400">Sending marks the step done. If you send it yourself instead, click Done afterwards and confirm what you sent.</p>}
    </div>
  );
}

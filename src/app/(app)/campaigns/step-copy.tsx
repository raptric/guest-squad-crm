"use client";

import { useState } from "react";
import { RichEditor } from "@/components/rich-editor";
import { MdText } from "@/components/md-text";

export type CopySource = "" | "ai" | "edited" | "human";
export type StepCopyValue = {
  subject: string;
  body: string;
  copy_source: CopySource;
  // what was saved last time, to say who wrote it while it is unchanged
  saved?: { subject: string; body: string; by: string | null; at: string | null };
};

type Version = { subject: string; body: string; words: number; warnings: string[] };

const field = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

const SOURCE_TEXT: Record<Exclude<CopySource, "">, string> = {
  ai: "Written by AI, not changed",
  edited: "Written by AI, then changed by hand",
  human: "Written by hand",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// The baseline email of one email step: a subject and a body, written by hand or with AI. It is saved with the campaign and
// later adapted for each company.
export function StepCopy({
  value,
  onChange,
  getDraft,
  stepIndex,
  senderName,
  hasPlaybook,
}: {
  value: StepCopyValue;
  onChange: (next: StepCopyValue) => void;
  getDraft: () => unknown;
  stepIndex: number;
  senderName: string;
  hasPlaybook: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [instruction, setInstruction] = useState("");
  const [showRead, setShowRead] = useState(false);

  const hasText = Boolean(value.subject.trim() || value.body.trim());
  const unchanged = value.saved && value.saved.subject === value.subject && value.saved.body === value.body;

  function edit(patch: Partial<Pick<StepCopyValue, "subject" | "body">>) {
    const subject = patch.subject ?? value.subject;
    const body = patch.body ?? value.body;
    const empty = !subject.trim() && !body.trim();
    onChange({ ...value, subject, body, copy_source: empty ? "" : value.copy_source === "ai" ? "edited" : value.copy_source || "human" });
  }

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/campaigns/generate-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign: getDraft(), step_index: stepIndex, instruction }),
    });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as { versions?: Version[]; remaining?: number; error?: string };
    if (!res.ok || !data.versions) {
      setError(data.error ?? "Couldn't write the email");
      return;
    }
    setVersions(data.versions);
    setRemaining(data.remaining ?? null);
  }

  const sample = (t: string) => t.replaceAll("{first_name}", "Alex").replaceAll("{company_name}", "Harbor Inn").replaceAll("{city}", "Austin").replaceAll("{sender_name}", senderName || "Your name");

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-sm font-medium text-zinc-800">Baseline email</span>
          <span className="ml-2 text-xs text-zinc-500">Optional. Written once here, then adapted for each company.</span>
        </div>
        {hasText && value.copy_source && (
          <span className="text-xs text-zinc-500">
            {SOURCE_TEXT[value.copy_source]}
            {unchanged && value.saved?.by ? ` · saved by ${value.saved.by}${value.saved.at ? `, ${day(value.saved.at)}` : ""}` : ""}
          </span>
        )}
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-500">Subject</span>
        <input value={value.subject} maxLength={200} onChange={(e) => edit({ subject: e.target.value })} className={field} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-500">Email</span>
        <RichEditor value={value.body} onChange={(b) => edit({ body: b })} placeholder="Write it here, or click Generate with AI. Use {first_name}, {company_name}, {city} and {sender_name} where the real values will go." ariaLabel="Baseline email" minHeight="12rem" />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={generate} disabled={busy} className="rounded-lg bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:opacity-50">
          {busy ? "Writing…" : hasText || versions ? "Generate again" : "Generate with AI"}
        </button>
        <input
          value={instruction}
          maxLength={300}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Anything specific? e.g. shorter, mention the pilot (optional)"
          className={`${field} min-w-0 flex-1 sm:max-w-sm`}
        />
        {hasText && (
          <button type="button" onClick={() => setShowRead((v) => !v)} className="text-sm text-sky-700 hover:underline">
            {showRead ? "Hide how it reads" : "How it reads"}
          </button>
        )}
      </div>
      {!hasPlaybook && <p className="text-xs text-amber-700">Fill in the Messaging section first (angle and main pain). The email is written from it.</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {remaining !== null && <p className="text-xs text-zinc-400">{remaining} AI {remaining === 1 ? "write" : "writes"} left today.</p>}

      {showRead && hasText && (
        <div className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-800">
          <p className="mb-1 text-xs text-zinc-500">With sample names filled in (Alex, Harbor Inn, Austin):</p>
          {value.subject && <p className="font-medium">Subject: {sample(value.subject)}</p>}
          <MdText text={sample(value.body)} className="mt-1" />
        </div>
      )}

      {versions && (
        <div className="space-y-3 border-t border-zinc-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-800">{versions.length === 1 ? "The AI wrote this" : `The AI wrote ${versions.length} versions`}</span>
            <button type="button" onClick={() => setVersions(null)} className="text-xs text-zinc-500 hover:text-zinc-800">
              Close
            </button>
          </div>
          {hasText && <p className="text-xs text-amber-700">Using a version replaces the subject and email above.</p>}
          <div className={`grid gap-3 ${versions.length > 1 ? "lg:grid-cols-2" : ""}`}>
            {versions.map((v, i) => (
              <article key={i} className="flex flex-col rounded-lg border border-zinc-200 p-3">
                <p className="text-xs font-medium text-zinc-500">
                  {versions.length > 1 ? `Version ${i + 1} · ` : ""}
                  {v.words} words
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-900">{v.subject || "(no subject)"}</p>
                <MdText text={v.body} className="mt-1 flex-1 text-sm text-zinc-700" />
                {v.warnings.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-amber-700">
                    {v.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onChange({ ...value, subject: v.subject, body: v.body, copy_source: "ai" });
                    setVersions(null);
                  }}
                  className="mt-3 self-start rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Use this version
                </button>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

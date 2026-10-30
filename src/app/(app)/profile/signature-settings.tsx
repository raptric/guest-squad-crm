"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RichEditor } from "@/components/rich-editor";
import { SIGNATURE_MAX, suggestedSignature } from "@/lib/signature-format";

// Profile -> Email signature: added under the text of every email sent from the CRM, so a person's emails always end the same way.
export function SignatureSettings({ saved, name, jobTitle, phone }: { saved: string; name: string; jobTitle: string; phone: string }) {
  const router = useRouter();
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = text.trim() !== saved.trim();

  async function save() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/profile/signature", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature: text }) });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as { error?: string; signature?: string };
    if (!res.ok) return setNote({ ok: false, text: data.error ?? "Couldn't save" });
    setText(data.signature ?? text.trim());
    setNote({ ok: true, text: "Saved. It is added to every email you send from now on." });
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Email signature</h2>
        <p className="text-sm text-zinc-500">Added under every email you send from the CRM, so they all end the same way. The AI ends an email with a short closing such as &quot;Best,&quot; and leaves the name to this signature.</p>
      </div>
      <RichEditor value={text} onChange={setText} disabled={busy} placeholder="Your name, job title, phone" ariaLabel="Email signature" minHeight="6rem" />
      <p className={`text-xs ${text.length > SIGNATURE_MAX ? "text-red-600" : "text-zinc-400"}`}>{text.length} of {SIGNATURE_MAX} characters</p>
      {!text.trim() && <p className="text-xs text-zinc-500">With no signature, your name ({name}) is added instead.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={save} disabled={busy || !changed} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save signature"}
        </button>
        {!text.trim() && (
          <button type="button" onClick={() => setText(suggestedSignature({ name, job_title: jobTitle, phone }))} disabled={busy} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Start from my name, title and phone
          </button>
        )}
        {note && <span className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</span>}
      </div>
    </section>
  );
}

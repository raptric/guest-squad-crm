"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { KnowledgeEntry } from "@/lib/ai/content";
import { KNOWLEDGE_BODY_MAX } from "@/lib/ai/knowledge-format";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

// One knowledge topic: a text box and a Save button.
export function KnowledgeCard({ entry }: { entry: KnowledgeEntry }) {
  const router = useRouter();
  const [text, setText] = useState(entry.body);
  const [saved, setSaved] = useState(entry.body);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/admin/ai/knowledge/${encodeURIComponent(entry.key)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
    setBusy(false);
    if (!res.ok) {
      setNote({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save" });
      return;
    }
    setSaved(text.trim());
    setText(text.trim());
    setNote({ ok: true, text: "Saved." });
    router.refresh();
  }

  const changed = text.trim() !== saved.trim();

  return (
    <section className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{entry.title}</h3>
        <span className="text-xs text-zinc-400">{entry.updated_at ? `Edited ${when(entry.updated_at)}${entry.updated_by ? ` by ${entry.updated_by}` : ""}` : "Not written yet"}</span>
      </div>
      <p className="text-xs text-zinc-500">{entry.hint}</p>
      <textarea
        rows={entry.rows}
        value={text}
        maxLength={KNOWLEDGE_BODY_MAX}
        disabled={busy}
        onChange={(e) => {
          setText(e.target.value);
          setNote(null);
        }}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
      />
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy || !changed} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save"}
        </button>
        {changed && !busy && <span className="text-xs text-amber-700">Not saved yet</span>}
        {note && <span className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</span>}
        <span className="ml-auto text-xs text-zinc-400">
          {text.length.toLocaleString()} / {KNOWLEDGE_BODY_MAX.toLocaleString()}
        </span>
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PromptEntry } from "@/lib/ai/content";
import { PROMPT_BODY_MAX } from "@/lib/ai/prompts-format";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

// One prompt: a text box, Save, and a way back to the starting text.
export function PromptCard({ def, entry }: { def: { key: string; title: string; when: string; defaultBody: string }; entry: PromptEntry }) {
  const router = useRouter();
  const [text, setText] = useState(entry.body);
  const [saved, setSaved] = useState(entry.body);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = text.trim() !== saved.trim();

  async function save() {
    setBusy(true);
    setNote(null);
    const res = await fetch(`/api/admin/ai/prompts/${def.key}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
    setBusy(false);
    if (!res.ok) {
      setNote({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save" });
      return;
    }
    setText(text.trim());
    setSaved(text.trim());
    setNote({ ok: true, text: "Saved." });
    router.refresh();
  }

  return (
    <article className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{def.title}</h3>
        <span className="text-xs text-zinc-400">{entry.updated_at ? `Edited ${when(entry.updated_at)}${entry.updated_by ? ` by ${entry.updated_by}` : ""}` : "Starting text"}</span>
      </div>
      <p className="text-xs text-zinc-500">{def.when}</p>
      <textarea
        rows={26}
        value={text}
        maxLength={PROMPT_BODY_MAX}
        disabled={busy}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setNote(null);
        }}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-[13px] leading-relaxed focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy || !changed || !text.trim()} className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save prompt"}
        </button>
        <button
          onClick={() => {
            if (window.confirm("Replace the text with the starting prompt? Nothing is saved until you click Save prompt.")) {
              setText(def.defaultBody);
              setNote(null);
            }
          }}
          disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Back to starting text
        </button>
        {changed && !busy && <span className="text-xs text-amber-700">Not saved yet</span>}
        {note && <span className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</span>}
        <span className="ml-auto text-xs text-zinc-400">
          {text.length.toLocaleString()} / {PROMPT_BODY_MAX.toLocaleString()}
        </span>
      </div>
    </article>
  );
}

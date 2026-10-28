"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Example } from "@/lib/ai/content";
import { ROLES, roleLabel, type RoleKey } from "@/lib/ai/rules-format";

const field = "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60";
const primary = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50";
const secondary = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

type Draft = { role: RoleKey; audience: string; subject: string; body: string; kind: "good" | "bad"; note: string };
const EMPTY: Draft = { role: "opener", audience: "any", subject: "", body: "", kind: "good", note: "" };

function ExampleForm({ initial, audiences, id, onDone }: { initial: Draft; audiences: string[]; id?: string; onDone: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const isEmail = ROLES.find((r) => r.key === d.role)?.channel === "email";

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(id ? `/api/admin/ai/examples/${id}` : "/api/admin/ai/examples", { method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save");
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50/40 p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs font-medium text-zinc-600">
          What kind of step
          <select value={d.role} onChange={(e) => set({ role: e.target.value as RoleKey })} className={field}>
            {ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-zinc-600">
          Written for
          <select value={d.audience} onChange={(e) => set({ audience: e.target.value })} className={field}>
            <option value="any">Any company type</option>
            {audiences.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-zinc-600">
          Good or bad
          <select value={d.kind} onChange={(e) => set({ kind: e.target.value as "good" | "bad" })} className={field}>
            <option value="good">Good, copy this style</option>
            <option value="bad">Bad, avoid this</option>
          </select>
        </label>
      </div>
      {isEmail && (
        <label className="block space-y-1 text-xs font-medium text-zinc-600">
          Subject
          <input value={d.subject} maxLength={200} onChange={(e) => set({ subject: e.target.value })} className={field} />
        </label>
      )}
      <label className="block space-y-1 text-xs font-medium text-zinc-600">
        Text
        <textarea rows={8} maxLength={3000} value={d.body} onChange={(e) => set({ body: e.target.value })} className={field} placeholder="Paste the full text. Use {first_name}, {property_name} and {city} where the real values would go." />
      </label>
      <label className="block space-y-1 text-xs font-medium text-zinc-600">
        {d.kind === "good" ? "Why it works (optional)" : "What is wrong with it (optional)"}
        <input value={d.note} maxLength={500} onChange={(e) => set({ note: e.target.value })} className={field} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !d.body.trim()} className={primary}>
          {busy ? "Saving…" : id ? "Save changes" : "Add example"}
        </button>
        <button onClick={onDone} disabled={busy} className={secondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ExampleCard({ e, audiences }: { e: Example; audiences: string[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (editing) return <ExampleForm id={e.id} initial={{ role: e.role, audience: e.audience, subject: e.subject, body: e.body, kind: e.kind, note: e.note }} audiences={audiences} onDone={() => setEditing(false)} />;

  async function remove() {
    if (!window.confirm("Remove this example? You can bring it back from the history.")) return;
    setBusy(true);
    await fetch(`/api/admin/ai/examples/${e.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <article className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${e.kind === "good" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{e.kind === "good" ? "Good" : "Bad"}</span>
        <span className="text-sm font-medium text-zinc-800">{roleLabel(e.role)}</span>
        <span className="text-xs text-zinc-500">{e.audience === "any" ? "Any company type" : e.audience}</span>
        <span className="ml-auto flex gap-2">
          <button onClick={() => setEditing(true)} disabled={busy} className="text-sm text-sky-700 hover:underline">
            Edit
          </button>
          <button onClick={remove} disabled={busy} className="text-sm text-red-700 hover:underline">
            Remove
          </button>
        </span>
      </div>
      {e.subject && <p className="text-sm text-zinc-700">Subject: {e.subject}</p>}
      <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-700">{e.body}</pre>
      {e.note && <p className="text-xs text-zinc-500">Note: {e.note}</p>}
    </article>
  );
}

export function ExamplesPanel({ examples, audiences }: { examples: Example[]; audiences: string[] }) {
  const [adding, setAdding] = useState(false);
  const good = examples.filter((e) => e.kind === "good");
  const bad = examples.filter((e) => e.kind === "bad");

  return (
    <div className="space-y-5">
      {adding ? (
        <ExampleForm initial={EMPTY} audiences={audiences} onDone={() => setAdding(false)} />
      ) : (
        <button onClick={() => setAdding(true)} className={primary}>
          Add example
        </button>
      )}

      {examples.length === 0 && !adding && <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">No examples yet. Add your best real emails, scripts and messages.</p>}

      {good.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">Good examples ({good.length})</h2>
          {good.map((e) => (
            <ExampleCard key={e.id} e={e} audiences={audiences} />
          ))}
        </section>
      )}
      {bad.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">Bad examples ({bad.length})</h2>
          {bad.map((e) => (
            <ExampleCard key={e.id} e={e} audiences={audiences} />
          ))}
        </section>
      )}
    </div>
  );
}

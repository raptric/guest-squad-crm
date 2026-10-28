"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_RULES, PAIN_TYPES, ROLES, type Creativity, type RoleKey, type Rules } from "@/lib/ai/rules-format";

const field = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const card = "space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className={card}>
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Num({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return <input type="number" min={0} aria-label={label} value={value} onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className={`${field} w-20`} />;
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

// A list of short phrases shown as removable tags. Enter or a comma adds what is typed.
function Tags({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((p) => p.trim()).filter(Boolean);
    setDraft("");
    if (!parts.length) return;
    const have = new Set(values.map((v) => v.toLowerCase()));
    onChange([...values, ...parts.filter((p) => !have.has(p.toLowerCase()) && have.add(p.toLowerCase()))]);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pl-3 pr-1.5 text-xs text-zinc-700">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="grid h-4 w-4 place-items-center rounded-full hover:bg-zinc-300">
              ×
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-zinc-400">None.</span>}
      </div>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        className={`${field} w-full`}
      />
    </div>
  );
}

export function RulesPanel({ initial, updatedAt, updatedBy }: { initial: Rules; updatedAt: string | null; updatedBy: string | null }) {
  const router = useRouter();
  const [rules, setRules] = useState<Rules>(initial);
  const [saved, setSaved] = useState<Rules>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = !same(rules, saved);

  const set = (patch: Partial<Rules>) => {
    setRules((r) => ({ ...r, ...patch }));
    setNote(null);
  };
  const setRole = (k: RoleKey, patch: Partial<Rules["roles"][RoleKey]>) => set({ roles: { ...rules.roles, [k]: { ...rules.roles[k], ...patch } } });
  const setEmail = (patch: Partial<Rules["email"]>) => set({ email: { ...rules.email, ...patch } });

  async function save() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/admin/ai/rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) });
    setBusy(false);
    if (!res.ok) {
      setNote({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Couldn't save" });
      return;
    }
    setSaved(rules);
    setNote({ ok: true, text: "Saved." });
    router.refresh();
  }

  return (
    <div className="space-y-5 pb-20">
      <Section title="Email basics" hint="Rules every cold email must follow. The checks next to a draft use these.">
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
          Subject line is
          <Num value={rules.email.subjectMinWords} onChange={(n) => setEmail({ subjectMinWords: n })} label="Subject minimum words" />
          to
          <Num value={rules.email.subjectMaxWords} onChange={(n) => setEmail({ subjectMaxWords: n })} label="Subject maximum words" />
          words
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Check checked={rules.email.lowercaseSubject} onChange={(v) => setEmail({ lowercaseSubject: v })}>Subject in lowercase</Check>
          <Check checked={rules.email.noLinksInFirst} onChange={(v) => setEmail({ noLinksInFirst: v })}>No links in the first email</Check>
          <Check checked={rules.email.plainTextOnly} onChange={(v) => setEmail({ plainTextOnly: v })}>Plain text only (no images, no formatting)</Check>
          <Check checked={rules.email.oneAsk} onChange={(v) => setEmail({ oneAsk: v })}>Exactly one ask</Check>
          <Check checked={rules.email.personalHook} onChange={(v) => setEmail({ personalHook: v })}>Open with something real about them</Check>
        </div>
      </Section>

      <Section title="Step roles" hint="Each kind of step has a length and a few notes on what it should do.">
        <div className="space-y-4">
          {ROLES.map((r) => (
            <div key={r.key} className="space-y-1.5 border-t border-zinc-100 pt-3 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-48 font-medium text-zinc-800">{r.label}</span>
                <Num value={rules.roles[r.key].min} onChange={(n) => setRole(r.key, { min: n })} label={`${r.label} minimum`} />
                <span className="text-zinc-500">to</span>
                <Num value={rules.roles[r.key].max} onChange={(n) => setRole(r.key, { max: n })} label={`${r.label} maximum`} />
                <span className="text-zinc-500">{r.unit}</span>
              </div>
              <input value={rules.roles[r.key].notes} maxLength={600} onChange={(e) => setRole(r.key, { notes: e.target.value })} className={`${field} w-full`} aria-label={`${r.label} notes`} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Voice" hint="How GuestSquad sounds. Say what we are and what we are not.">
        <textarea rows={5} maxLength={2000} value={rules.voice} onChange={(e) => set({ voice: e.target.value })} className={`${field} w-full`} />
      </Section>

      <Section title="Banned phrases" hint="The AI must never write these. Type one and press Enter.">
        <Tags values={rules.bannedPhrases} onChange={(v) => set({ bannedPhrases: v })} placeholder="Add a phrase" />
      </Section>

      <Section title="Spam-trigger words" hint="Words that push emails into spam. The AI avoids them.">
        <Tags values={rules.spamWords} onChange={(v) => set({ spamWords: v })} placeholder="Add a word" />
      </Section>

      <Section title="Pain to angle" hint="When a campaign (or a hotel) has this pain, this is the angle the writing takes.">
        <div className="space-y-2">
          {PAIN_TYPES.map((p) => (
            <div key={p} className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-center">
              <span className="text-sm font-medium text-zinc-800">{p}</span>
              <input value={rules.painAngles[p] ?? ""} maxLength={300} onChange={(e) => set({ painAngles: { ...rules.painAngles, [p]: e.target.value } })} className={`${field} w-full`} aria-label={`${p} angle`} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Extra rules" hint="Anything else the AI must always do. One rule per line.">
        <textarea rows={6} maxLength={3000} value={rules.extra} onChange={(e) => set({ extra: e.target.value })} className={`${field} w-full`} />
      </Section>

      <Section title="Generation defaults" hint="How many versions to write for each click, and how adventurous the wording is.">
        <div className="flex flex-wrap items-center gap-4 text-sm text-zinc-700">
          <label className="flex items-center gap-2">
            Versions per click
            <select value={rules.defaults.variants} onChange={(e) => set({ defaults: { ...rules.defaults, variants: Number(e.target.value) as 1 | 2 | 3 } })} className={field}>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Creativity
            <select value={rules.defaults.creativity} onChange={(e) => set({ defaults: { ...rules.defaults, creativity: e.target.value as Creativity } })} className={field}>
              <option value="low">Low (safe, consistent)</option>
              <option value="medium">Medium</option>
              <option value="high">High (more varied)</option>
            </select>
          </label>
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
        <button onClick={save} disabled={busy || !changed} className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
          {busy ? "Saving…" : "Save rules"}
        </button>
        <button
          onClick={() => {
            if (window.confirm("Put every rule back to the starting values? Nothing is saved until you click Save rules.")) {
              setRules(DEFAULT_RULES);
              setNote(null);
            }
          }}
          disabled={busy}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          Back to starting values
        </button>
        {changed && !busy && <span className="text-xs text-amber-700">Not saved yet</span>}
        {note && <span className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</span>}
        <span className="ml-auto text-xs text-zinc-400">{updatedAt ? `Last saved ${new Date(updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}${updatedBy ? ` by ${updatedBy}` : ""}` : "Starting values (never saved)"}</span>
      </div>
    </div>
  );
}

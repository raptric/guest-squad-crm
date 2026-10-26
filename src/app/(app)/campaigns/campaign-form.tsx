"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "../icons";
import { CHANNELS } from "@/lib/campaigns-format";

type Step = { key: number; day_number: string; channel: string; title: string; instructions: string };
type Initial = {
  id: string;
  name: string;
  description: string;
  steps: { day_number: number; channel: string; title: string; instructions: string }[];
};

const field = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

let keySeed = 0;
const newStep = (day = 1): Step => ({ key: ++keySeed, day_number: String(day), channel: "Email", title: "", instructions: "" });

// Create / edit a campaign: a name, a detailed description, and an ordered list of steps (day, channel, title, instructions).
export function CampaignForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [steps, setSteps] = useState<Step[]>(
    initial?.steps.length
      ? initial.steps.map((s) => ({ key: ++keySeed, day_number: String(s.day_number), channel: s.channel, title: s.title, instructions: s.instructions }))
      : [newStep(1)]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: number, patch: Partial<Step>) => setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (index: number, dir: -1 | 1) =>
    setSteps((all) => {
      const next = [...all];
      const to = index + dir;
      if (to < 0 || to >= next.length) return all;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  const addStep = () => {
    const days = steps.map((s) => Number(s.day_number) || 0);
    setSteps((all) => [...all, newStep(days.length ? Math.max(...days) + 2 : 1)]);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(initial ? `/api/admin/campaigns/${initial.id}` : "/api/admin/campaigns", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        steps: steps.map((s) => ({ day_number: Number(s.day_number), channel: s.channel, title: s.title, instructions: s.instructions })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't save the campaign");
      return;
    }
    router.push("/campaigns");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900">About this campaign</h2>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-700">Name</span>
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cold outreach: independent hotels" className={field} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-700">Description</span>
          <textarea
            rows={7}
            maxLength={8000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this campaign is for: who it targets, what we want to achieve, the tone to use, the main points to get across. The more detail, the better. People read it before they start, and it will later be used to help write messages."
            className={field}
          />
          <span className="text-xs text-zinc-500">{description.length.toLocaleString()} / 8,000</span>
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Steps</h2>
          <p className="text-sm text-zinc-500">
            <strong>Day 1 is the day a company is enrolled</strong>, so Day 3 is two days later. Steps are ordered by day. Nothing is sent automatically: each step becomes a task for the person to do and tick off.
          </p>
        </div>

        <ol className="space-y-4">
          {steps.map((s, i) => (
            <li key={s.key} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-zinc-700">Step {i + 1}</span>
                <div className="flex items-center gap-1">
                  <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpIcon className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownIcon className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Remove step" disabled={steps.length === 1} onClick={() => setSteps((all) => all.filter((x) => x.key !== s.key))}>
                    <TrashIcon className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[110px_220px_1fr]">
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-500">Day</span>
                  <input required type="number" min={1} max={365} value={s.day_number} onChange={(e) => update(s.key, { day_number: e.target.value })} className={field} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-500">Channel</span>
                  <select value={s.channel} onChange={(e) => update(s.key, { channel: e.target.value })} className={field}>
                    {CHANNELS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium text-zinc-500">Title</span>
                  <input required maxLength={200} value={s.title} onChange={(e) => update(s.key, { title: e.target.value })} placeholder="e.g. First email, introduce GuestSquad" className={field} />
                </label>
              </div>
              <label className="mt-3 block space-y-1">
                <span className="text-xs font-medium text-zinc-500">Instructions</span>
                <textarea
                  rows={3}
                  maxLength={4000}
                  value={s.instructions}
                  onChange={(e) => update(s.key, { instructions: e.target.value })}
                  placeholder="What the person should do and say in this step: the goal, key points, what to mention, what to avoid."
                  className={field}
                />
              </label>
            </li>
          ))}
        </ol>

        <button type="button" onClick={addStep} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50">
          <PlusIcon className="h-4 w-4" />
          Add step
        </button>
      </section>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50">
          {saving ? "Saving..." : initial ? "Save changes" : "Create campaign"}
        </button>
        <button type="button" onClick={() => router.push("/campaigns")} className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50">
          Cancel
        </button>
      </div>
      {initial && (
        <p className="text-xs text-zinc-500">Changes apply to companies enrolled from now on. Tasks that already exist keep the steps they were created with.</p>
      )}
    </form>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, TrashIcon } from "../icons";
import { CHANNELS, VISIBILITY_LABEL, type Visibility } from "@/lib/campaigns-format";

type Step = { key: number; day_number: string; channel: string; title: string; instructions: string };
type Objection = { key: number; objection: string; response: string };

export type CampaignFormInitial = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  visibility: Visibility;
  team_id: string | null;
  owner_id: string | null;
  steps: { day_number: number; channel: string; title: string; instructions: string }[];
  outreach_angle: string | null;
  pain_point: string;
  secondary_pains: string[];
  positioning: string;
  differentiators: string[];
  objections: { objection: string; response: string }[];
};

type Lists = { angles: string[]; differentiators: string[] };
type Viewer = { role: string; teamId: string | null; teamName: string | null; id: string; name: string };

const field = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

let keySeed = 0;
const newStep = (day = 1): Step => ({ key: ++keySeed, day_number: String(day), channel: "Email", title: "", instructions: "" });
const newObjection = (): Objection => ({ key: ++keySeed, objection: "", response: "" });

// Create / edit a campaign: identity, messaging (the playbook) and the ordered steps.
export function CampaignForm({
  initial,
  lists,
  viewer,
  teams,
  users,
}: {
  initial?: CampaignFormInitial;
  lists: Lists;
  viewer: Viewer;
  teams: { id: string; name: string }[];
  users: { id: string; name: string }[];
}) {
  const router = useRouter();
  const isAdmin = viewer.role === "super_admin";
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "private");
  const [teamId, setTeamId] = useState(initial?.team_id ?? teams[0]?.id ?? "");
  const [ownerId, setOwnerId] = useState(initial?.owner_id ?? viewer.id);
  const [status, setStatus] = useState<"draft" | "active">("draft");
  const [angle, setAngle] = useState(initial?.outreach_angle ?? "");
  const [pain, setPain] = useState(initial?.pain_point ?? "");
  const [secondary, setSecondary] = useState<string[]>(initial?.secondary_pains ?? []);
  const [positioning, setPositioning] = useState(initial?.positioning ?? "");
  const [diffs, setDiffs] = useState<string[]>(initial?.differentiators ?? []);
  const [objections, setObjections] = useState<Objection[]>((initial?.objections ?? []).map((o) => ({ key: ++keySeed, ...o })));
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
  const toggle = (list: string[], set: (v: string[]) => void, value: string) => set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  // A value saved earlier that has since been switched off in Settings still shows, so it isn't lost on save.
  const withSaved = (list: string[], saved: string[]) => [...list, ...saved.filter((v) => !list.includes(v))];
  const angleOptions = withSaved(lists.angles, initial?.outreach_angle ? [initial.outreach_angle] : []);
  const secondaryOptions = withSaved(lists.angles, initial?.secondary_pains ?? []).filter((a) => a !== angle);
  const diffOptions = withSaved(lists.differentiators, initial?.differentiators ?? []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(initial ? `/api/campaigns/${initial.id}` : "/api/campaigns", {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        visibility,
        team_id: visibility === "team" && isAdmin ? Number(teamId) : null,
        owner_id: isAdmin ? Number(ownerId) : null,
        status: initial ? undefined : status,
        outreach_angle: angle || null,
        pain_point: pain,
        secondary_pains: secondary.filter((p) => p !== angle),
        positioning,
        differentiators: diffs,
        objections: objections.map((o) => ({ objection: o.objection, response: o.response })),
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

  const visibilityOptions: { value: Visibility; hint: string }[] = [
    { value: "private", hint: "Only you (and admins) see it." },
    {
      value: "team",
      hint: isAdmin ? "Everyone in the team you pick." : viewer.teamName ? `Everyone in ${viewer.teamName}.` : "You aren't in a team yet.",
    },
    { value: "public", hint: "Every signed-in person can see and use it." },
  ];

  return (
    <form onSubmit={save} className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-900">Identity</h2>
          {initial && <span className="rounded-md bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-600">{initial.code}</span>}
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-700">Name</span>
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Independent hotels: after-hours coverage" className={field} />
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-zinc-700">Who can see it</legend>
          {visibilityOptions.map((o) => (
            <label key={o.value} className={`flex items-start gap-2 text-sm ${o.value === "team" && !isAdmin && !viewer.teamId ? "text-zinc-400" : "cursor-pointer text-zinc-700"}`}>
              <input
                type="radio"
                name="visibility"
                disabled={o.value === "team" && !isAdmin && !viewer.teamId}
                checked={visibility === o.value}
                onChange={() => setVisibility(o.value)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{VISIBILITY_LABEL[o.value]}</span> <span className="text-zinc-500">{o.hint}</span>
              </span>
            </label>
          ))}
          {visibility === "team" && isAdmin && (
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className={`${field} max-w-xs`} aria-label="Team">
              {teams.length === 0 && <option value="">No teams yet</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Owner</span>
            {isAdmin ? (
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={field}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            ) : (
              <input disabled value={initial ? users.find((u) => u.id === initial.owner_id)?.name ?? viewer.name : viewer.name} className={`${field} bg-zinc-50 text-zinc-500`} />
            )}
          </label>
          {!initial && (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-zinc-700">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as "draft" | "active")} className={field}>
                <option value="draft">Draft (not open for enrollment yet)</option>
                <option value="active">Active (needs the angle and main pain point)</option>
              </select>
            </label>
          )}
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-700">Description</span>
          <textarea
            rows={6}
            maxLength={8000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="The strategy brief: who this campaign targets, what we want to achieve, the tone to use."
            className={field}
          />
          <span className="text-xs text-zinc-500">{description.length.toLocaleString()} / 8,000</span>
        </label>
      </section>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Messaging</h2>
          <p className="text-sm text-zinc-500">The playbook people see next to their tasks. Everyone always sees the latest text.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Primary outreach angle</span>
            <select value={angle} onChange={(e) => setAngle(e.target.value)} className={field}>
              <option value="">Choose…</option>
              {angleOptions.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">Primary pain point</span>
            <input maxLength={400} value={pain} onChange={(e) => setPain(e.target.value)} placeholder="e.g. Guests need help after reception closes" className={field} />
          </label>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-zinc-700">Other pain points <span className="font-normal text-zinc-400">(optional)</span></legend>
          <Checks options={secondaryOptions} selected={secondary} onToggle={(v) => toggle(secondary, setSecondary, v)} empty="Choose a primary angle first, or add more angles in Settings." />
        </fieldset>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-700">Positioning statement</span>
          <input maxLength={400} value={positioning} onChange={(e) => setPositioning(e.target.value)} placeholder="What the hotel gets, in one line. e.g. We complement your reception team" className={field} />
        </label>

        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-zinc-700">Key differentiators <span className="font-normal text-zinc-400">(optional)</span></legend>
          <Checks options={diffOptions} selected={diffs} onToggle={(v) => toggle(diffs, setDiffs, v)} empty="No differentiators yet. An admin adds them in Settings." />
        </fieldset>

        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-700">Objections and responses <span className="font-normal text-zinc-400">(up to 10)</span></p>
          {objections.map((o, i) => (
            <div key={o.key} className="grid gap-2 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 sm:grid-cols-[1fr_1.4fr_auto]">
              <input
                maxLength={200}
                value={o.objection}
                onChange={(e) => setObjections((all) => all.map((x) => (x.key === o.key ? { ...x, objection: e.target.value } : x)))}
                placeholder="Objection, e.g. We already have staff"
                className={field}
                aria-label={`Objection ${i + 1}`}
              />
              <textarea
                rows={2}
                maxLength={600}
                value={o.response}
                onChange={(e) => setObjections((all) => all.map((x) => (x.key === o.key ? { ...x, response: e.target.value } : x)))}
                placeholder="How to respond"
                className={field}
                aria-label={`Response ${i + 1}`}
              />
              <button type="button" aria-label="Remove objection" onClick={() => setObjections((all) => all.filter((x) => x.key !== o.key))} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
          {objections.length < 10 && (
            <button type="button" onClick={() => setObjections((all) => [...all, newObjection()])} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50">
              <PlusIcon className="h-4 w-4" />
              Add objection
            </button>
          )}
        </div>
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
      {initial && <p className="text-xs text-zinc-500">Changes to steps apply to companies enrolled from now on. Tasks that already exist keep the steps they were created with. The playbook is always the latest text.</p>}
    </form>
  );
}

function Checks({ options, selected, onToggle, empty }: { options: string[]; selected: string[]; onToggle: (v: string) => void; empty: string }) {
  if (options.length === 0) return <p className="text-xs text-zinc-500">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${selected.includes(o) ? "border-sky-500 bg-sky-50 text-sky-800" : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"}`}>
          <input type="checkbox" className="sr-only" checked={selected.includes(o)} onChange={() => onToggle(o)} />
          {o}
        </label>
      ))}
    </div>
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

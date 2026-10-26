"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon } from "../icons";
import { STATUS_COLORS, type PipelineStatus } from "@/lib/pipeline-format";

const input = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";

// Admin editor for the pipeline: statuses, and the stages inside each one. Nothing is deleted, only switched off.
export function PipelineSettings({ statuses }: { statuses: PipelineStatus[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save");
      return false;
    }
    router.refresh();
    return true;
  }
  const patch = (kind: "statuses" | "stages", id: string, body: Record<string, unknown>) => call(`/api/admin/pipeline/${kind}/${id}`, "PATCH", body);

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Statuses &amp; stages</h2>
        <p className="mt-1 text-xs text-zinc-500">
          A company has one status (the main head) and one stage inside it. Each status has its own stages. Rename, reorder or switch off anything; switched-off values can&apos;t be picked any more,
          but companies already on them keep them.
        </p>
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-3">
        {statuses.map((s, i) => (
          <div key={s.id} className={`rounded-xl border ${s.is_active ? "border-zinc-200" : "border-dashed border-zinc-300 bg-zinc-50"}`}>
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-4 py-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_COLORS[s.color]?.dot ?? "bg-zinc-400"}`} />
              <NameEdit value={s.name} muted={!s.is_active} onSave={(name) => patch("statuses", s.id, { name })} bold />
              <span className="text-xs text-zinc-400">{s.companies ?? 0} {s.companies === 1 ? "company" : "companies"}</span>
              {!s.is_active && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600">Switched off</span>}
              <span className="flex-1" />
              <select
                value={s.color}
                onChange={(e) => patch("statuses", s.id, { color: e.target.value })}
                aria-label={`Colour for ${s.name}`}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600"
              >
                {Object.entries(STATUS_COLORS).map(([k, c]) => (
                  <option key={k} value={k}>
                    {c.label}
                  </option>
                ))}
              </select>
              <MoveButtons disabled={busy} first={i === 0} last={i === statuses.length - 1} onMove={(move) => patch("statuses", s.id, { move })} />
              <button onClick={() => patch("statuses", s.id, { is_active: !s.is_active })} disabled={busy} className="text-xs text-zinc-500 underline hover:text-zinc-800 disabled:opacity-50">
                {s.is_active ? "Switch off" : "Switch on"}
              </button>
            </div>

            <ul className="divide-y divide-zinc-100 px-4">
              {s.stages.map((g, j) => (
                <li key={g.id} className="flex flex-wrap items-center gap-2 py-2 pl-5 text-sm">
                  <span className="text-zinc-300">&#8627;</span>
                  <NameEdit value={g.name} muted={!g.is_active} onSave={(name) => patch("stages", g.id, { name })} />
                  <span className="text-xs text-zinc-400">{g.companies ?? 0}</span>
                  {!g.is_active && <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-600">Switched off</span>}
                  <span className="flex-1" />
                  <MoveButtons disabled={busy} first={j === 0} last={j === s.stages.length - 1} onMove={(move) => patch("stages", g.id, { move })} />
                  <button onClick={() => patch("stages", g.id, { is_active: !g.is_active })} disabled={busy} className="text-xs text-zinc-500 underline hover:text-zinc-800 disabled:opacity-50">
                    {g.is_active ? "Switch off" : "Switch on"}
                  </button>
                </li>
              ))}
            </ul>

            <AddForm
              placeholder={`New stage in ${s.name}`}
              button="Add stage"
              disabled={busy}
              onAdd={(name) => call("/api/admin/pipeline", "POST", { kind: "stage", status_id: s.id, name })}
            />
          </div>
        ))}
      </div>

      <NewStatus busy={busy} onAdd={(v) => call("/api/admin/pipeline", "POST", { kind: "status", ...v })} />
    </section>
  );
}

function MoveButtons({ first, last, disabled, onMove }: { first: boolean; last: boolean; disabled: boolean; onMove: (m: "up" | "down") => void }) {
  const cls = "grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-zinc-100 disabled:opacity-30";
  return (
    <span className="flex">
      <button type="button" aria-label="Move up" title="Move up" disabled={disabled || first} onClick={() => onMove("up")} className={cls}>
        <ArrowUpIcon className="h-3.5 w-3.5" />
      </button>
      <button type="button" aria-label="Move down" title="Move down" disabled={disabled || last} onClick={() => onMove("down")} className={cls}>
        <ArrowDownIcon className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

// Click the name to rename; Enter or clicking away saves, Esc cancels.
function NameEdit({ value, onSave, bold, muted }: { value: string; onSave: (name: string) => Promise<boolean>; bold?: boolean; muted?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === value) return setDraft(value);
    if (!(await onSave(next))) setDraft(value);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={60}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className={`${input} py-0.5`}
      />
    );
  }
  return (
    <button
      type="button"
      title="Click to rename"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={`rounded px-1 text-left hover:bg-zinc-100 ${bold ? "font-semibold" : ""} ${muted ? "text-zinc-400" : "text-zinc-900"}`}
    >
      {value}
    </button>
  );
}

function AddForm({ placeholder, button, disabled, onAdd }: { placeholder: string; button: string; disabled: boolean; onAdd: (name: string) => Promise<boolean> }) {
  const [name, setName] = useState("");
  return (
    <form
      className="flex gap-2 border-t border-zinc-100 px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onAdd(name)) setName("");
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={60} required className={`${input} flex-1`} />
      <button type="submit" disabled={disabled} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
        {button}
      </button>
    </form>
  );
}

function NewStatus({ busy, onAdd }: { busy: boolean; onAdd: (v: { name: string; first_stage: string; color: string }) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [firstStage, setFirstStage] = useState("");
  const [color, setColor] = useState("sky");
  return (
    <form
      className="space-y-2 rounded-xl border border-dashed border-zinc-300 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await onAdd({ name, first_stage: firstStage, color })) {
          setName("");
          setFirstStage("");
        }
      }}
    >
      <p className="text-xs font-medium text-zinc-600">Add a status</p>
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Status name" maxLength={60} required className={`${input} min-w-40 flex-1`} />
        <input value={firstStage} onChange={(e) => setFirstStage(e.target.value)} placeholder="Its first stage" maxLength={60} required className={`${input} min-w-40 flex-1`} />
        <select value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" className={`${input} bg-white`}>
          {Object.entries(STATUS_COLORS).map(([k, c]) => (
            <option key={k} value={k}>
              {c.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
          Add status
        </button>
      </div>
    </form>
  );
}

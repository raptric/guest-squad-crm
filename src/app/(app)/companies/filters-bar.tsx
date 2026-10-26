"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  HAS_OPTIONS,
  NO_TIER,
  PORTFOLIO_OPTIONS,
  PRESETS,
  VERIFICATION_LABELS,
  VERIFICATION_OPTIONS,
} from "@/lib/companies/list-filters";
import type { Facets, Option } from "@/lib/companies/list-query";
import { STATUS_COLORS, statusChip } from "@/lib/pipeline-format";

const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
const MULTI_KEYS = ["status", "stage", "verification", "tier", "country", "state", "ctype", "ptype", "pclass", "owner", "team", "batch", "source"];

// Every control writes straight to the URL (no Apply button); the page re-renders with the new results.
export function FiltersBar({ facets, counts }: { facets: Facets; counts: { status: Record<string, number>; stage: Record<string, number> } }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function apply(mutate: (p: URLSearchParams) => void) {
    const p = new URLSearchParams(sp.toString());
    mutate(p);
    p.delete("page");
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  }
  const values = (key: string) => sp.getAll(key);
  const toggle = (key: string, value: string) =>
    apply((p) => {
      const current = p.getAll(key);
      p.delete(key);
      (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]).forEach((v) => p.append(key, v));
    });
  // Status chips: picking / un-picking a status also drops any chosen stage that doesn't belong to the statuses now selected.
  const toggleStatus = (name: string) =>
    apply((p) => {
      const current = p.getAll("status");
      const next = current.includes(name) ? current.filter((v) => v !== name) : [...current, name];
      p.delete("status");
      next.forEach((v) => p.append("status", v));
      const allowed = new Set(facets.pipeline.filter((s) => next.includes(s.name)).flatMap((s) => s.stages.map((g) => g.id)));
      const stages = p.getAll("stage").filter((v) => allowed.has(v));
      p.delete("stage");
      stages.forEach((v) => p.append("stage", v));
    });
  const selectedStatuses = values("status");
  const stageRowStatus = selectedStatuses.length === 1 ? facets.pipeline.find((s) => s.name === selectedStatuses[0]) : undefined;
  const setOne = (key: string, value: string) =>
    apply((p) => {
      if (value) p.set(key, value);
      else p.delete(key);
    });

  // Small render helpers that wire the module-level components to the URL.
  const check = (title: string, name: string, options: Option[], searchable = false) => (
    <CheckGroup key={name} title={title} options={options} searchable={searchable} selected={values(name)} onToggle={(v) => toggle(name, v)} />
  );
  const text = (paramKey: string, props: { type?: string; placeholder?: string } = {}) => (
    <DebouncedInput key={paramKey} paramKey={paramKey} urlValue={sp.get(paramKey) ?? ""} onCommit={setOne} {...props} />
  );
  const plain = (list: string[]): Option[] => list.map((s) => ({ value: s, label: s }));

  // ----- active filters as removable chips -----
  const labelOf = (opts: Option[], v: string) => opts.find((o) => o.value === v)?.label ?? v;
  type Chip = { key: string; value: string; label: string };
  const chips: Chip[] = [];
  const addMulti = (key: string, label: (v: string) => string) => values(key).forEach((v) => chips.push({ key, value: v, label: label(v) }));
  const addOne = (key: string, label: string | null | undefined) => {
    const v = sp.get(key);
    if (v && label) chips.push({ key, value: v, label });
  };
  addOne("q", `Search: "${sp.get("q")}"`);
  addMulti("status", (v) => v);
  addMulti("stage", (v) => labelOf(facets.stages, v));
  addMulti("verification", (v) => VERIFICATION_LABELS[v] ?? v);
  addMulti("tier", (v) => v);
  addMulti("country", (v) => v);
  addMulti("state", (v) => v);
  addOne("city", `City: ${sp.get("city")}`);
  addMulti("ctype", (v) => v);
  addMulti("ptype", (v) => v);
  addMulti("pclass", (v) => v);
  addOne("portfolio", PORTFOLIO_OPTIONS.find((o) => o.value === sp.get("portfolio"))?.label);
  addOne("group", `Group: ${sp.get("group")}`);
  addMulti("owner", (v) => (v === "unassigned" ? "Unassigned" : `Owner: ${labelOf(facets.owners, v)}`));
  addMulti("team", (v) => (v === "none" ? "No team" : `Team: ${labelOf(facets.teams, v)}`));
  addMulti("batch", (v) => (v === "none" ? "No campaign" : `Campaign: ${labelOf(facets.batches, v)}`));
  addMulti("source", (v) => `Source: ${v}`);
  (["website", "phone", "email", "contacts"] as const).forEach((k) =>
    addOne(k, `${k[0].toUpperCase()}${k.slice(1)}: ${sp.get(k) === "has" ? "has" : "missing"}`)
  );
  addOne("roomsMin", `Rooms ≥ ${sp.get("roomsMin")}`);
  addOne("roomsMax", `Rooms ≤ ${sp.get("roomsMax")}`);
  addOne("ratingMin", `Google ≥ ${sp.get("ratingMin")}`);
  addOne("addedFrom", `Added from ${sp.get("addedFrom")}`);
  addOne("addedTo", `Added to ${sp.get("addedTo")}`);

  const removeChip = (c: Chip) => (c.key === "status" ? toggleStatus(c.value) : MULTI_KEYS.includes(c.key) ? toggle(c.key, c.value) : setOne(c.key, ""));
  const clearAll = () =>
    apply((p) => {
      const keep = ["sort", "dir", "size"].map((k) => [k, p.get(k)] as const);
      [...new Set(p.keys())].forEach((k) => p.delete(k));
      keep.forEach(([k, v]) => v && p.set(k, v));
    });

  // ----- presets -----
  const filterKeys = [...new Set([...sp.keys()].filter((k) => !["sort", "dir", "size", "page"].includes(k)))];
  const isPreset = (params: Record<string, string | string[]>) => {
    const keys = Object.keys(params);
    return (
      keys.length === filterKeys.length &&
      keys.every((k) => values(k).slice().sort().join("|") === ([] as string[]).concat(params[k]).sort().join("|"))
    );
  };
  const applyPreset = (params: Record<string, string | string[]>) =>
    apply((p) => {
      filterKeys.forEach((k) => p.delete(k));
      Object.entries(params).forEach(([k, v]) => ([] as string[]).concat(v).forEach((x) => p.append(k, x)));
    });

  const activeCount = chips.filter((c) => c.key !== "q").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-400">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <DebouncedInput paramKey="q" urlValue={sp.get("q") ?? ""} onCommit={setOne} placeholder="Search name, city, website, phone, email..." padded />
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium shadow-sm ${open ? "border-sky-300 bg-sky-50 text-sky-800" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}
        >
          Filters
          {activeCount > 0 && <span className="rounded-full bg-sky-600 px-2 py-0.5 text-xs font-semibold text-white">{activeCount}</span>}
        </button>
        {chips.length > 0 && (
          <button onClick={clearAll} className="text-sm text-zinc-500 hover:text-zinc-800">
            Clear all
          </button>
        )}
        {pending && <span className="text-xs text-zinc-400">Updating...</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p.params)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${isPreset(p.params) ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {facets.pipeline.map((s) => {
            const on = selectedStatuses.includes(s.name);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStatus(s.name)}
                aria-pressed={on}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${on ? `${statusChip(s.color)} border-transparent ring-2 ring-zinc-900/15` : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}
              >
                <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[s.color]?.dot ?? "bg-zinc-400"}`} />
                {s.name}
                <span className={`text-xs font-semibold tabular-nums ${on ? "opacity-80" : "text-zinc-400"}`}>{(counts.status[s.id] ?? 0).toLocaleString()}</span>
              </button>
            );
          })}
        </div>
        {stageRowStatus && (
          <div className="flex flex-wrap items-center gap-2 pl-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">{stageRowStatus.name} stage</span>
            {stageRowStatus.stages.map((g) => {
              const on = values("stage").includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggle("stage", g.id)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}
                >
                  {g.name}
                  <span className={`tabular-nums ${on ? "text-white/70" : "text-zinc-400"}`}>{(counts.stage[g.id] ?? 0).toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={`${c.key}:${c.value}`} className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 py-1 pl-3 pr-2 text-xs font-medium text-sky-800">
              {c.label}
              <button onClick={() => removeChip(c)} aria-label={`Remove ${c.label}`} className="grid h-4 w-4 place-items-center rounded-full hover:bg-sky-200">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="grid gap-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
          <Column title="Status">
            {facets.pipeline.map((s) => (
              <CheckGroup
                key={`stage-${s.id}`}
                title={`${s.name} stage`}
                options={s.stages.map((g) => ({ value: g.id, label: g.name, n: counts.stage[g.id] ?? 0 }))}
                searchable={false}
                selected={values("stage").filter((v) => s.stages.some((g) => g.id === v))}
                onToggle={(v) => toggle("stage", v)}
              />
            ))}
            {check("Verification", "verification", VERIFICATION_OPTIONS.map((v) => ({ value: v, label: VERIFICATION_LABELS[v] ?? v })))}
            {check("Tier", "tier", plain([...facets.tiers, NO_TIER]))}
          </Column>

          <Column title="Portfolio & property">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-500">Portfolio</p>
              {[{ value: "", label: "Any" }, ...PORTFOLIO_OPTIONS].map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                  <input type="radio" name="portfolio" checked={(sp.get("portfolio") ?? "") === o.value} onChange={() => setOne("portfolio", o.value)} />
                  {o.label}
                </label>
              ))}
            </div>
            <Labeled label="Group name contains">{text("group", { placeholder: "e.g. Promoseven" })}</Labeled>
            {check("Company type", "ctype", plain(facets.ctypes))}
            {check("Property type", "ptype", plain(facets.ptypes))}
            {check("Property class", "pclass", plain(facets.pclasses))}
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Rooms min">{text("roomsMin", { type: "number" })}</Labeled>
              <Labeled label="Rooms max">{text("roomsMax", { type: "number" })}</Labeled>
            </div>
            <Labeled label="Google rating at least">{text("ratingMin", { type: "number", placeholder: "e.g. 4" })}</Labeled>
          </Column>

          <Column title="Location & ownership">
            {check("Country", "country", facets.countries, true)}
            {check("State", "state", facets.states, true)}
            <Labeled label="City contains">{text("city")}</Labeled>
            {check("Owner", "owner", [{ value: "unassigned", label: "Unassigned" }, ...facets.owners], true)}
            {check("Team", "team", [{ value: "none", label: "No team" }, ...facets.teams])}
          </Column>

          <Column title="Source & data">
            {check("Campaign", "batch", [{ value: "none", label: "No campaign" }, ...facets.batches], true)}
            {check("Source", "source", facets.sources)}
            <div className="grid grid-cols-2 gap-2">
              {(["website", "phone", "email", "contacts"] as const).map((k) => (
                <Labeled key={k} label={k[0].toUpperCase() + k.slice(1)}>
                  <select className={input} value={sp.get(k) ?? ""} onChange={(e) => setOne(k, e.target.value)}>
                    <option value="">Any</option>
                    {HAS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Labeled>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Labeled label="Added from">{text("addedFrom", { type: "date" })}</Labeled>
              <Labeled label="Added to">{text("addedTo", { type: "date" })}</Labeled>
            </div>
          </Column>
        </div>
      )}
    </div>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{title}</h3>
      {children}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function CheckGroup({
  title,
  options,
  searchable,
  selected,
  onToggle,
}: {
  title: string;
  options: Option[];
  searchable: boolean;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const shown = filter ? options.filter((o) => o.label.toLowerCase().includes(filter.toLowerCase())) : options;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-zinc-500">
        {title}
        {selected.length > 0 && <span className="ml-1 text-sky-600">({selected.length})</span>}
      </p>
      {searchable && options.length > 8 && (
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Find ${title.toLowerCase()}...`} className={`${input} py-1.5`} />
      )}
      <div className={`space-y-1 ${options.length > 8 ? "max-h-44 overflow-y-auto pr-1" : ""}`}>
        {shown.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.n !== undefined && <span className="text-xs text-zinc-400">{o.n.toLocaleString()}</span>}
          </label>
        ))}
        {shown.length === 0 && <p className="text-xs text-zinc-400">No matches.</p>}
      </div>
    </div>
  );
}

// Text/number/date input that writes to the URL after a short pause (instantly for dates).
function DebouncedInput({
  paramKey,
  urlValue,
  onCommit,
  type = "text",
  placeholder,
  padded,
}: {
  paramKey: string;
  urlValue: string;
  onCommit: (key: string, value: string) => void;
  type?: string;
  placeholder?: string;
  padded?: boolean;
}) {
  const [local, setLocal] = useState(urlValue);
  const ref = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow the URL when it changes from elsewhere (chip removed, preset applied) but not while typing.
  useEffect(() => {
    if (document.activeElement !== ref.current) setLocal(urlValue);
  }, [urlValue]);

  return (
    <input
      ref={ref}
      type={type}
      value={local}
      placeholder={placeholder}
      className={`${input} ${padded ? "pl-9" : ""}`}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => onCommit(paramKey, v.trim()), type === "date" ? 0 : 350);
      }}
    />
  );
}

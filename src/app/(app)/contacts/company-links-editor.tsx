"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanyOption, LinkRow } from "./contact-types";
import { ProvenanceNote } from "./provenance-note";

const inputClass = "w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm";

const withCurrent = (options: string[], current: string) =>
  current && !options.includes(current) ? [current, ...options] : options;

// The contact's companies. The first is primary. Title, role and decision-maker level are
// per company, and each link can be marked verified once a person has confirmed it.
export function CompanyLinksEditor({
  value,
  onChange,
  roles,
  levels,
}: {
  value: LinkRow[];
  onChange: (rows: LinkRow[]) => void;
  roles: string[];
  levels: string[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyOption[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetch(`/api/companies/search?${new URLSearchParams({ q: query, all: "1" })}`)
        .then((res) => res.json())
        .then((body) => setResults(body.companies ?? []));
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = new Set(value.map((r) => r.company.id));
  const suggestions = results.filter((c) => !selected.has(c.id));
  const update = (index: number, patch: Partial<LinkRow>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-3">
      {value.map((row, index) => (
        <div key={row.company.id} className="space-y-2 rounded-md border border-zinc-300 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-zinc-900">
              {row.company.name} <span className="font-normal text-zinc-500">({row.company.company_type})</span>
              {index === 0 && <span className="ml-2 rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-white">Primary</span>}
            </span>
            <span className="flex gap-3 text-xs">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([row, ...value.filter((_, i) => i !== index)])}
                  className="text-zinc-500 hover:text-zinc-700"
                >
                  Make primary
                </button>
              )}
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              placeholder="Job title at this company"
              value={row.job_title}
              onChange={(e) => update(index, { job_title: e.target.value })}
              className={inputClass}
            />
            <select value={row.contact_role} onChange={(e) => update(index, { contact_role: e.target.value })} className={inputClass}>
              <option value="">Role —</option>
              {withCurrent(roles, row.contact_role).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={row.decision_maker_level}
              onChange={(e) => update(index, { decision_maker_level: e.target.value })}
              className={inputClass}
            >
              <option value="">Decision maker —</option>
              {withCurrent(levels, row.decision_maker_level).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-700">
            <input
              type="checkbox"
              checked={row.is_verified}
              onChange={(e) => update(index, { is_verified: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Verified: confirmed this person works here
          </label>
          <ProvenanceNote row={row} />
        </div>
      ))}

      <div ref={containerRef} className="relative">
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder={value.length ? "Add another company..." : "Search companies by name..."}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
        {open && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-sm">
            {suggestions.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange([
                      ...value,
                      { company: c, job_title: "", contact_role: "", decision_maker_level: "", is_verified: false },
                    ]);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50"
                >
                  {c.name} <span className="text-zinc-500">({c.company_type})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

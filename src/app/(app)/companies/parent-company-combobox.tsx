"use client";

import { useEffect, useRef, useState } from "react";

type CompanyOption = { id: number; name: string; company_type: string };

export function ParentCompanyCombobox({
  name,
  initialValue,
  excludeId,
}: {
  name: string;
  initialValue?: CompanyOption | null;
  excludeId?: number;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyOption[]>([]);
  const [selected, setSelected] = useState<CompanyOption | null>(initialValue ?? null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) return;

    const timeout = setTimeout(() => {
      const params = new URLSearchParams({ q: query });
      if (excludeId) params.set("exclude", String(excludeId));
      fetch(`/api/companies/search?${params.toString()}`)
        .then((res) => res.json())
        .then((body) => setResults(body.companies ?? []));
    }, 250);

    return () => clearTimeout(timeout);
  }, [query, selected, excludeId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name={name} value={selected?.id ?? ""} />

      {selected ? (
        <div className="flex items-center justify-between rounded-md border border-zinc-300 px-3 py-2 text-sm">
          <span>
            {selected.name} <span className="text-zinc-500">({selected.company_type})</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
            }}
            className="text-xs text-zinc-500 hover:text-zinc-700"
          >
            Change
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Search companies by name..."
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      )}

      {open && !selected && results.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-sm">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(c);
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
  );
}

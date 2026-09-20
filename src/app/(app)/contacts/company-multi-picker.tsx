"use client";

import { useEffect, useRef, useState } from "react";

export type CompanyOption = { id: number; name: string; company_type: string };

// Ordered list of companies; the first one is the contact's primary company.
export function CompanyMultiPicker({
  value,
  onChange,
}: {
  value: CompanyOption[];
  onChange: (companies: CompanyOption[]) => void;
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

  const selectedIds = new Set(value.map((c) => c.id));
  const suggestions = results.filter((c) => !selectedIds.has(c.id));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((c, index) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            >
              <span>
                {c.name} <span className="text-zinc-500">({c.company_type})</span>
                {index === 0 && (
                  <span className="ml-2 rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-white">Primary</span>
                )}
              </span>
              <span className="flex gap-3 text-xs">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange([c, ...value.filter((v) => v.id !== c.id)])}
                    className="text-zinc-500 hover:text-zinc-700"
                  >
                    Make primary
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v.id !== c.id))}
                  className="text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

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
                    onChange([...value, c]);
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

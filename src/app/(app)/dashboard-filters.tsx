"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type FilterOptions = Record<"country" | "state" | "city" | "status" | "type", string[]>;

const FILTERS: { key: keyof FilterOptions; label: string }[] = [
  { key: "country", label: "Country" },
  { key: "state", label: "State" },
  { key: "city", label: "City" },
  { key: "status", label: "Status" },
  { key: "type", label: "Type" },
];

// Narrower filters depend on broader ones, so changing one clears those below it.
const CLEARS: Partial<Record<keyof FilterOptions, (keyof FilterOptions)[]>> = {
  country: ["state", "city"],
  state: ["city"],
};

export function DashboardFilters({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const params = useSearchParams();

  function change(key: keyof FilterOptions, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    CLEARS[key]?.forEach((k) => next.delete(k));
    router.push(`/?${next.toString()}`);
  }

  const active = FILTERS.some(({ key }) => params.get(key));

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      {FILTERS.map(({ key, label }) => {
        const current = params.get(key) ?? "";
        const values = current && !options[key].includes(current) ? [current, ...options[key]] : options[key];
        return (
          <div key={key} className="space-y-1">
            <label className="block text-xs font-medium text-zinc-700">{label}</label>
            <select
              value={current}
              onChange={(e) => change(key, e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            >
              <option value="">All</option>
              {values.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {active && (
        <button
          type="button"
          onClick={() => router.push(`/?group=${params.get("group") ?? "country"}`)}
          className="pb-1.5 text-sm text-zinc-500 hover:text-zinc-700"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

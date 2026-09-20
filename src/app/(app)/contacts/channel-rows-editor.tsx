"use client";

import type { ChannelRow, CompanyOption } from "./contact-types";
import { ProvenanceNote } from "./provenance-note";

const inputClass = "w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm";

// Repeatable email or phone rows. The first row is primary. A row can be tied to one of the
// contact's companies (a work address) or left general (personal email, cell).
export function ChannelRowsEditor({
  kind,
  value,
  onChange,
  labels,
  companies,
}: {
  kind: "email" | "phone";
  value: ChannelRow[];
  onChange: (rows: ChannelRow[]) => void;
  labels: string[];
  companies: CompanyOption[];
}) {
  const update = (index: number, patch: Partial<ChannelRow>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      {value.map((row, index) => (
        <div key={index} className="space-y-1 rounded-md border border-zinc-200 p-2">
          <div className="grid grid-cols-[1fr_120px_1fr_auto] items-center gap-2">
            <input
              type={kind === "email" ? "email" : "text"}
              placeholder={kind === "email" ? "name@example.com" : "+1 555 010 0100"}
              value={row.value}
              onChange={(e) => update(index, { value: e.target.value })}
              className={inputClass}
            />
            <select value={row.label} onChange={(e) => update(index, { label: e.target.value })} className={inputClass}>
              <option value="">Label —</option>
              {(row.label && !labels.includes(row.label) ? [row.label, ...labels] : labels).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select
              value={row.company_id ?? ""}
              onChange={(e) => update(index, { company_id: e.target.value ? Number(e.target.value) : null })}
              className={inputClass}
            >
              <option value="">General (any company)</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1 text-zinc-700">
                <input
                  type="checkbox"
                  checked={row.is_verified}
                  onChange={(e) => update(index, { is_verified: e.target.checked })}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Verified
              </label>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </span>
          </div>
          {index === 0 && <span className="text-xs text-zinc-500">Primary</span>}
          <ProvenanceNote row={row} />
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { value: "", label: "", company_id: null, is_verified: false }])}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
      >
        + Add {kind}
      </button>
    </div>
  );
}

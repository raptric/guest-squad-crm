"use client";

import { useMemo, useState } from "react";
import { CODES, CODE_GROUPS, asTag } from "@/lib/ai/codes-format";

// The list of every short code, grouped. Clicking one inserts it into the prompt being edited.
export function CodePanel({ onInsert, activeTitle, hint }: { onInsert: (tag: string) => void; activeTitle: string | null; hint: string | null }) {
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ Knowledge: true, "Writing rules": true, Campaign: true, Company: true });

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return CODES.filter((c) => !f || c.code.includes(f) || c.label.toLowerCase().includes(f));
  }, [filter]);

  return (
    <div className="max-h-[calc(100vh-2rem)] space-y-3 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Short codes</h2>
        <p className="text-xs text-zinc-500">{activeTitle ? `Click a code to put it into “${activeTitle}”.` : "Click inside a prompt, then click a code to put it there."}</p>
        {hint && <p className="mt-1 text-xs text-amber-700">{hint}</p>}
      </div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search codes" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100" />
      <div className="space-y-1.5 text-xs text-zinc-500">
        <p>
          <span className="rounded bg-sky-50 px-1.5 py-0.5 font-medium text-sky-800">block</span> a labelled section. A block with nothing in it disappears.
        </p>
        <p>
          <span className="rounded bg-violet-50 px-1.5 py-0.5 font-medium text-violet-800">company</span> only has a value in the Company prompts.
        </p>
      </div>

      {CODE_GROUPS.map((group) => {
        const rows = shown.filter((c) => c.group === group);
        if (!rows.length) return null;
        const isOpen = filter.trim() ? true : (open[group] ?? false);
        return (
          <section key={group} className="border-t border-zinc-100 pt-2">
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [group]: !isOpen }))} className="flex w-full items-center justify-between py-1 text-left text-sm font-medium text-zinc-800">
              {group}
              <span className="text-xs text-zinc-400">{isOpen ? "−" : `${rows.length} +`}</span>
            </button>
            {isOpen && (
              <ul className="space-y-1.5 pb-1">
                {rows.map((c) => (
                  <li key={c.code}>
                    <button type="button" onClick={() => onInsert(asTag(c.code))} title={`Insert ${asTag(c.code)}`} className="group w-full rounded-md px-2 py-1 text-left hover:bg-zinc-50">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-xs text-zinc-900 group-hover:text-sky-700">{asTag(c.code)}</span>
                        {c.block && <span className="rounded bg-sky-50 px-1.5 text-[10px] font-medium text-sky-800">block</span>}
                        {c.scope === "company" && <span className="rounded bg-violet-50 px-1.5 text-[10px] font-medium text-violet-800">company</span>}
                        {c.soon && <span className="rounded bg-zinc-100 px-1.5 text-[10px] font-medium text-zinc-600">empty until baselines exist</span>}
                        {c.optIn && <span className="rounded bg-zinc-100 px-1.5 text-[10px] font-medium text-zinc-600">not in the block</span>}
                      </span>
                      <span className="block text-xs text-zinc-500">{c.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {shown.length === 0 && <p className="text-sm text-zinc-500">No code matches.</p>}
    </div>
  );
}

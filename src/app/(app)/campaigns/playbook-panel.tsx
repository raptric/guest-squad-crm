import type { Playbook } from "@/lib/campaigns";

// The campaign's messaging as a short read-only cheat-sheet. Collapsed by default so it doesn't crowd a task;
// always the latest text. Plain markup, so it works in server and client components.
export function PlaybookPanel({ playbook, defaultOpen = false }: { playbook: Playbook | undefined; defaultOpen?: boolean }) {
  if (!playbook) return null;
  const p = playbook;
  const empty = !p.outreach_angle && !p.pain_point && !p.positioning && !p.secondary_pains.length && !p.differentiators.length;
  // "Other" shows what was written instead of the word.
  const withOther = (items: string[], other: string) => items.map((x) => (x === "Other" && other ? `Other: ${other}` : x));
  if (empty) return null;

  return (
    <details open={defaultOpen} className="group rounded-xl border border-violet-100 bg-violet-50/50 text-sm text-zinc-700">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-violet-700 hover:text-violet-900">
        Playbook{p.outreach_angle ? <span className="ml-2 font-medium normal-case tracking-normal text-zinc-600">{p.outreach_angle}</span> : null}
      </summary>
      <div className="space-y-3 border-t border-violet-100 px-3 py-3">
        {p.pain_point && (
          <div>
            <p className="text-xs font-medium text-zinc-500">Main pain point</p>
            <p className="whitespace-pre-wrap">{p.pain_point}</p>
          </div>
        )}
        {p.secondary_pains.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500">Also</p>
            <Chips items={withOther(p.secondary_pains, p.secondary_other)} />
          </div>
        )}
        {p.positioning && (
          <div>
            <p className="text-xs font-medium text-zinc-500">Positioning</p>
            <p className="whitespace-pre-wrap">{p.positioning}</p>
          </div>
        )}
        {p.differentiators.length > 0 && (
          <div>
            <p className="text-xs font-medium text-zinc-500">Key differentiators</p>
            <Chips items={withOther(p.differentiators, p.differentiators_other)} />
          </div>
        )}
      </div>
    </details>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {items.map((x) => (
        <span key={x} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-violet-100">
          {x}
        </span>
      ))}
    </div>
  );
}

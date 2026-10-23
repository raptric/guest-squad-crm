"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Team = { id: number; name: string };
type Person = { id: number; name: string; teamName: string | null };
type Action = "team" | "user" | "remove_owner" | "remove_team";
type Counts = { selected: number; already_there: number; assigned_elsewhere: number; will_change: number };

type Ctx = {
  pageIds: number[];
  total: number;
  count: number;
  allMatching: boolean;
  isSelected: (id: number) => boolean;
  toggleRow: (id: number) => void;
  pageAllSelected: boolean;
  togglePage: () => void;
  selectAllMatching: () => void;
  clear: () => void;
};
const SelectionContext = createContext<Ctx | null>(null);
const useSelection = () => {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("Selection components must be inside <SelectionProvider>");
  return ctx;
};

const ACTION_LABELS: Record<Action, string> = {
  team: "Assign to team",
  user: "Assign to person",
  remove_owner: "Remove owner",
  remove_team: "Remove from team",
};

// Holds the row selection for the Companies table. Selecting "all N matching" is remembered as a rule
// (the current filters, minus any rows unticked afterwards), not as thousands of ids.
export function SelectionProvider({
  pageIds,
  total,
  filtersQs,
  isAdmin,
  teams,
  people,
  children,
}: {
  pageIds: number[];
  total: number;
  filtersQs: string;
  isAdmin: boolean;
  teams: Team[];
  people: Person[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const count = allMatching ? total - excluded.size : selected.size;
  const isSelected = (id: number) => (allMatching ? !excluded.has(id) : selected.has(id));
  const flip = (set: Set<number>, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const pageAllSelected = pageIds.length > 0 && pageIds.every(isSelected);

  const ctx: Ctx = {
    pageIds,
    total,
    count,
    allMatching,
    isSelected,
    toggleRow: (id) => (allMatching ? setExcluded((s) => flip(s, id)) : setSelected((s) => flip(s, id))),
    pageAllSelected,
    togglePage: () => {
      if (allMatching) {
        setExcluded((s) => {
          const next = new Set(s);
          pageIds.forEach((id) => (pageAllSelected ? next.add(id) : next.delete(id)));
          return next;
        });
      } else {
        setSelected((s) => {
          const next = new Set(s);
          pageIds.forEach((id) => (pageAllSelected ? next.delete(id) : next.add(id)));
          return next;
        });
      }
    },
    selectAllMatching: () => {
      setAllMatching(true);
      setExcluded(new Set());
    },
    clear: () => {
      setSelected(new Set());
      setAllMatching(false);
      setExcluded(new Set());
    },
  };

  const selection = allMatching ? { query: filtersQs, excludeIds: [...excluded] } : { ids: [...selected] };

  return (
    <SelectionContext.Provider value={ctx}>
      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-emerald-700 hover:text-emerald-900">
            Dismiss
          </button>
        </div>
      )}
      {children}

      {count > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-xl">
          <span className="mr-2 text-sm font-semibold text-zinc-900">{count.toLocaleString()} selected</span>
          {isAdmin && <BarButton onClick={() => setDialog("team")}>Assign to team</BarButton>}
          <BarButton onClick={() => setDialog("user")}>Assign to person</BarButton>
          <BarButton onClick={() => setDialog("remove_owner")}>Remove owner</BarButton>
          {isAdmin && <BarButton onClick={() => setDialog("remove_team")}>Remove from team</BarButton>}
          <button onClick={ctx.clear} className="ml-1 text-sm text-zinc-500 hover:text-zinc-800">
            Clear
          </button>
        </div>
      )}

      {dialog && (
        <AssignDialog
          action={dialog}
          selection={selection}
          teams={teams}
          people={people}
          isAdmin={isAdmin}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setDialog(null);
            ctx.clear();
            setNotice(message);
            router.refresh();
          }}
        />
      )}
    </SelectionContext.Provider>
  );
}

const BarButton = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
    {children}
  </button>
);

export function HeaderCheck() {
  const s = useSelection();
  return (
    <input
      type="checkbox"
      aria-label="Select all on this page"
      checked={s.pageAllSelected}
      onChange={s.togglePage}
      className="h-4 w-4 cursor-pointer"
    />
  );
}

export function RowCheck({ id }: { id: number }) {
  const s = useSelection();
  return <input type="checkbox" aria-label="Select company" checked={s.isSelected(id)} onChange={() => s.toggleRow(id)} className="h-4 w-4 cursor-pointer" />;
}

// "25 selected on this page -- select all 2,293 matching" / "All 2,293 selected".
export function SelectionBanner() {
  const s = useSelection();
  if (s.allMatching) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
        All <strong>{s.count.toLocaleString()}</strong> companies matching this search are selected.{" "}
        <button onClick={s.clear} className="font-medium underline">
          Clear selection
        </button>
      </div>
    );
  }
  if (s.pageAllSelected && s.total > s.pageIds.length) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-900">
        All {s.pageIds.length} companies on this page are selected.{" "}
        <button onClick={s.selectAllMatching} className="font-medium underline">
          Select all {s.total.toLocaleString()} companies matching this search
        </button>
      </div>
    );
  }
  return null;
}

function AssignDialog({
  action,
  selection,
  teams,
  people,
  isAdmin,
  onClose,
  onDone,
}: {
  action: Action;
  selection: { ids?: number[]; query?: string; excludeIds?: number[] };
  teams: Team[];
  people: Person[];
  isAdmin: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const needsTarget = action === "team" || action === "user";
  const [target, setTarget] = useState("");
  const [mode, setMode] = useState<"skip_assigned" | "reassign">("skip_assigned");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectionKey = JSON.stringify(selection);

  // Preview what would change whenever the choice changes.
  useEffect(() => {
    if (needsTarget && !target) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/companies/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dryRun: true, action, target_id: target ? Number(target) : undefined, mode, selection: JSON.parse(selectionKey) }),
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(body.error ?? "Couldn't preview this change");
        else setCounts(body);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [action, target, mode, selectionKey, needsTarget]);

  // Nothing to preview until a team / person has been chosen.
  const shownCounts = needsTarget && !target ? null : counts;

  async function confirm() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/companies/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, target_id: target ? Number(target) : undefined, mode, selection }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(body.error ?? "Couldn't save");
      return;
    }
    const verb = action === "remove_owner" ? "Removed the owner from" : action === "remove_team" ? "Removed the team from" : `Assigned to ${body.target_name}:`;
    onDone(`${verb} ${body.changed.toLocaleString()} ${body.changed === 1 ? "company" : "companies"}${body.skipped ? ` (${body.skipped.toLocaleString()} skipped)` : ""}.`);
  }

  const noun = action === "team" ? "team" : "owner";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-zinc-900">{ACTION_LABELS[action]}</h2>

        {needsTarget && (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-zinc-700">{action === "team" ? "Team" : "Person"}</span>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            >
              <option value="">{action === "team" ? "Choose a team..." : "Choose a person..."}</option>
              {action === "team"
                ? teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))
                : people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {isAdmin && p.teamName ? ` (${p.teamName})` : ""}
                    </option>
                  ))}
            </select>
            {action === "team" && teams.length === 0 && <p className="text-xs text-amber-700">There are no teams yet. Create one under Users &rarr; Teams.</p>}
          </label>
        )}

        {needsTarget && (
          <fieldset className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700">
              <input type="radio" checked={mode === "skip_assigned"} onChange={() => setMode("skip_assigned")} className="mt-1" />
              <span>Only companies that aren&apos;t assigned yet</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700">
              <input type="radio" checked={mode === "reassign"} onChange={() => setMode("reassign")} className="mt-1" />
              <span>Also move companies that already have a {noun} (replaces it)</span>
            </label>
          </fieldset>
        )}

        <div className="space-y-1 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700">
          {loading && <p className="text-zinc-400">Checking...</p>}
          {!loading && shownCounts && (
            <>
              <p>
                <strong>{shownCounts.selected.toLocaleString()}</strong> selected
              </p>
              {shownCounts.assigned_elsewhere > 0 && <p className="text-zinc-600">{shownCounts.assigned_elsewhere.toLocaleString()} already {action === "team" ? "belong to another team" : "belong to someone else"}</p>}
              {shownCounts.already_there > 0 && <p className="text-zinc-600">{shownCounts.already_there.toLocaleString()} {needsTarget ? "are already assigned to this " + (action === "team" ? "team" : "person") : "have nothing to remove"}</p>}
              <p className="pt-1 font-semibold text-zinc-900">{shownCounts.will_change.toLocaleString()} will be updated</p>
            </>
          )}
          {!loading && !shownCounts && needsTarget && <p className="text-zinc-400">Choose {action === "team" ? "a team" : "a person"} to see what will change.</p>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={saving || loading || !shownCounts || shownCounts.will_change === 0}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
          >
            {saving ? "Saving..." : shownCounts ? `Update ${shownCounts.will_change.toLocaleString()} ${shownCounts.will_change === 1 ? "company" : "companies"}` : "Update"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { blockerOf, lostInfo, type DupCompany, type DupGroup } from "@/lib/duplicates-format";
import { statusChip } from "@/lib/pipeline-format";

type Recent = { id: string; keptId: string | null; keptName: string | null; by: string | null; when: string; names: string[] };
type Scan = { groups: DupGroup[]; scanned: number; copies: number; scanned_at: string };

const PAGE = 25;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function DuplicatesView({ recent }: { recent: Recent[] }) {
  const router = useRouter();
  const [scan, setScan] = useState<Scan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [search, setSearch] = useState("");
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undoMsg, setUndoMsg] = useState<string | null>(null);

  async function check() {
    setScanning(true);
    setError(null);
    const res = await fetch("/api/duplicates/scan", { method: "POST" });
    setScanning(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "The check failed");
      return;
    }
    setScan(await res.json());
    setShown(PAGE);
  }

  async function undo(id: string) {
    setUndoing(id);
    setUndoMsg(null);
    const res = await fetch("/api/duplicates/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deletion_id: Number(id) }) });
    setUndoing(null);
    const body = await res.json().catch(() => ({}));
    setUndoMsg(res.ok ? `Restored ${body.restored} ${body.restored === 1 ? "company" : "companies"}. Run the check again to see them in their group.` : (body.error ?? "Couldn't undo"));
    router.refresh();
  }

  const extra = scan ? scan.copies - scan.groups.length : 0;
  const term = search.trim().toLowerCase();
  const visible = scan ? (term ? scan.groups.filter((g) => g.companies.some((c) => c.name.toLowerCase().includes(term) || (c.address ?? "").toLowerCase().includes(term))) : scan.groups) : [];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <button
          onClick={check}
          disabled={scanning}
          className="rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
        >
          {scanning ? "Checking..." : scan ? "Check again" : "Check for duplicates"}
        </button>
        {scan && (
          <p className="text-sm text-zinc-600">
            Checked <strong>{scan.scanned.toLocaleString()}</strong> companies. Found <strong>{scan.groups.length.toLocaleString()}</strong> {scan.groups.length === 1 ? "group" : "groups"} with{" "}
            <strong>{scan.copies.toLocaleString()}</strong> companies ({extra.toLocaleString()} extra {extra === 1 ? "copy" : "copies"}).
          </p>
        )}
        {!scan && !scanning && <p className="text-sm text-zinc-500">Scans the CRM and groups companies that look like copies of each other. Nothing is changed until you choose.</p>}
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </section>

      {scan && scan.groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <p className="font-medium text-zinc-800">No duplicates found</p>
          <p className="mt-1 text-sm text-zinc-500">Nothing in the CRM matches on name plus phone or address.</p>
        </div>
      )}

      {scan && scan.groups.length > 0 && (
        <div className="space-y-3">
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Find a company in these results (name or address)..."
            className="w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
          {visible.length === 0 && <p className="text-sm text-zinc-500">No groups match that search.</p>}
          {visible.slice(0, shown).map((g) => (
            <GroupCard key={g.key} group={g} onChanged={() => router.refresh()} />
          ))}
          {shown < visible.length && (
            <div className="text-center">
              <button onClick={() => setShown((n) => n + PAGE)} className="rounded-xl border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                Show {Math.min(PAGE, visible.length - shown)} more groups ({visible.length - shown} left)
              </button>
            </div>
          )}
        </div>
      )}

      {recent.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Recently deleted duplicates</h2>
          <p className="text-xs text-zinc-500">Undo brings the deleted copies back.</p>
          {undoMsg && <p className="text-sm text-zinc-700">{undoMsg}</p>}
          <ul className="divide-y divide-zinc-100 text-sm">
            {recent.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-zinc-800">
                    Deleted {d.names.join(", ")}
                    {d.keptId && (
                      <>
                        {" "}
                        — kept{" "}
                        <Link href={`/companies/${d.keptId}`} className="text-sky-700 hover:underline">
                          {d.keptName ?? `#${d.keptId}`}
                        </Link>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {d.by ?? "Someone"} · {fmtDate(d.when)}
                  </p>
                </div>
                <button onClick={() => undo(d.id)} disabled={undoing === d.id} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                  {undoing === d.id ? "Restoring..." : "Undo"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type Outcome = { kind: "deleted"; deletionId: number; count: number } | { kind: "dismissed" } | { kind: "undone" };

function GroupCard({ group, onChanged }: { group: DupGroup; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [keepId, setKeepId] = useState(group.suggested_id);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"delete" | "dismiss" | "undo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const keep = group.companies.find((c) => c.id === keepId)!;
  const others = group.companies.filter((c) => c.id !== keepId);
  const blocked = others.filter((c) => blockerOf(c));
  const warnings = others.map((c) => ({ company: c, lost: lostInfo(keep, c) })).filter((w) => w.lost.length > 0);
  const suggested = group.companies.find((c) => c.id === group.suggested_id)!;

  async function call(url: string, body: unknown, kind: "delete" | "dismiss" | "undo") {
    setBusy(kind);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Couldn't save");
      return null;
    }
    onChanged();
    return data;
  }

  if (outcome) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-sm text-zinc-700">
        <span>
          <strong>{suggested.name}</strong>:{" "}
          {outcome.kind === "deleted" && `kept ${keep.name} (#${keep.id}) and deleted ${outcome.count} ${outcome.count === 1 ? "copy" : "copies"}.`}
          {outcome.kind === "dismissed" && "marked as not duplicates."}
          {outcome.kind === "undone" && "restored. Run the check again to group them."}
        </span>
        {outcome.kind === "deleted" && (
          <button
            disabled={busy === "undo"}
            onClick={async () => {
              if (await call("/api/duplicates/undo", { deletion_id: outcome.deletionId }, "undo")) setOutcome({ kind: "undone" });
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
          >
            {busy === "undo" ? "Restoring..." : "Undo"}
          </button>
        )}
        {error && <span className="w-full text-xs text-red-600">{error}</span>}
      </div>
    );
  }

  const canDelete = blocked.length === 0 && (warnings.length === 0 || confirmed);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left">
        <div className="min-w-0">
          <p className="font-semibold text-zinc-900">{suggested.name}</p>
          <p className="text-xs text-zinc-500">
            {group.companies.length} copies · {group.match}
            {suggested.address ? ` · ${suggested.address}` : ""}
          </p>
        </div>
        <span className="text-xs font-medium text-sky-700">{open ? "Close" : "Review"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-zinc-100 px-5 py-4">
          <p className="text-xs text-zinc-600">
            <span className="font-medium text-emerald-700">Suggested to keep: #{suggested.id}.</span> {group.reasons.join(" · ")}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
                  <th className="py-2 pr-3">Keep</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Verified</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2 text-right">Contacts</th>
                  <th className="px-3 py-2">Portfolio</th>
                  <th className="px-3 py-2">Research</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="py-2 pl-3">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {group.companies.map((c) => (
                  <Row key={c.id} c={c} keepId={keepId} suggestedId={group.suggested_id} onKeep={() => { setKeepId(c.id); setConfirmed(false); }} />
                ))}
              </tbody>
            </table>
          </div>

          {blocked.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-medium">These copies can&apos;t be deleted, so keep one of them or fix the cause first:</p>
              <ul className="mt-1 list-disc pl-5">
                {blocked.map((c) => (
                  <li key={c.id}>
                    #{c.id}: {blockerOf(c)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {blocked.length === 0 && warnings.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">Deleting these would lose information the kept copy doesn&apos;t have:</p>
              <ul className="list-disc pl-5">
                {warnings.map((w) => (
                  <li key={w.company.id}>
                    #{w.company.id}: {w.lost.join("; ")}
                  </li>
                ))}
              </ul>
              <label className="flex items-center gap-2 pt-1 font-medium">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                I understand, delete them anyway
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              disabled={!canDelete || busy !== null}
              onClick={async () => {
                const data = await call("/api/duplicates/delete", { keep_id: Number(keepId), delete_ids: others.map((c) => Number(c.id)) }, "delete");
                if (data) setOutcome({ kind: "deleted", deletionId: data.deletion_id, count: data.deleted });
              }}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-40"
            >
              {busy === "delete" ? "Deleting..." : `Keep #${keepId}, delete ${others.length} ${others.length === 1 ? "other" : "others"}`}
            </button>
            <button
              disabled={busy !== null}
              onClick={async () => {
                if (await call("/api/duplicates/dismiss", { company_ids: group.companies.map((c) => Number(c.id)) }, "dismiss")) setOutcome({ kind: "dismissed" });
              }}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {busy === "dismiss" ? "Saving..." : "Not duplicates"}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ c, keepId, suggestedId, onKeep }: { c: DupCompany; keepId: string; suggestedId: string; onKeep: () => void }) {
  const isKeep = c.id === keepId;
  const blocker = blockerOf(c);
  return (
    <tr className={`align-top ${isKeep ? "bg-emerald-50/50" : ""}`}>
      <td className="py-3 pr-3">
        <input type="radio" name={`keep-${suggestedId}`} checked={isKeep} onChange={onKeep} aria-label={`Keep #${c.id}`} />
      </td>
      <td className="max-w-xs px-3 py-3">
        <Link href={`/companies/${c.id}`} target="_blank" className="font-medium text-sky-700 hover:underline">
          {c.name}
        </Link>
        <div className="text-xs text-zinc-500">
          #{c.id}
          {c.id === suggestedId && <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">Suggested</span>}
        </div>
        {c.address && <div className="truncate text-xs text-zinc-500">{c.address}</div>}
        {c.phone && <div className="text-xs text-zinc-500">{c.phone}</div>}
        {blocker && <div className="mt-1 text-xs font-medium text-red-700">Can&apos;t be deleted</div>}
      </td>
      <td className="px-3 py-3">
        {c.status_name ? (
          <>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusChip(c.status_color)}`}>{c.status_name}</span>
            {c.stage_name && <div className="mt-1 text-xs text-zinc-500">{c.stage_name}</div>}
          </>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className="px-3 py-3">{c.verified ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">Verified</span> : <span className="text-zinc-400">—</span>}</td>
      <td className="px-3 py-3 text-zinc-700">{c.owner_name ?? <span className="text-zinc-400">Unassigned</span>}</td>
      <td className="px-3 py-3 text-right tabular-nums text-zinc-700">{c.contacts || "—"}</td>
      <td className="px-3 py-3 text-zinc-700">{c.portfolio ? (c.parent_name ? `Part of ${c.parent_name}` : "Part of a portfolio") : c.children > 0 ? `Parent of ${c.children}` : <span className="text-zinc-400">—</span>}</td>
      <td className="px-3 py-3 text-xs text-zinc-600">
        {c.ratings + c.signals + c.offers === 0 ? (
          <span className="text-zinc-400">None</span>
        ) : (
          [c.ratings && `${c.ratings} rating${c.ratings === 1 ? "" : "s"}`, c.signals && `${c.signals} signal${c.signals === 1 ? "" : "s"}`, c.offers && `${c.offers} offer${c.offers === 1 ? "" : "s"}`].filter(Boolean).join(" · ")
        )}
      </td>
      <td className="px-3 py-3 text-xs text-zinc-600">
        {c.source ?? "—"}
        {c.campaign_name && <div className="max-w-[10rem] truncate text-zinc-400">{c.campaign_name}</div>}
      </td>
      <td className="whitespace-nowrap py-3 pl-3 text-xs text-zinc-500">{fmtDate(c.created_at)}</td>
    </tr>
  );
}

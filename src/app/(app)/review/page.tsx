import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LeadStatusActions } from "./lead-status-actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "new", label: "New", status: "New" },
  { key: "qualified", label: "Qualified", status: "Qualified" },
  { key: "needs_review", label: "Needs Review", status: "Needs Review" },
] as const;
const PAGE_SIZE = 20;

const daysAgo = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null);
const ageLabel = (days: number | null) => (days === null ? "—" : days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`);
const ageColor = (days: number | null, warnAt: number, alertAt: number) =>
  days === null ? "text-zinc-500" : days >= alertAt ? "text-red-600" : days >= warnAt ? "text-amber-600" : "text-zinc-600";

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; country?: string; state?: string; city?: string; page?: string }>;
}) {
  const params = await searchParams;
  const tab = TABS.find((t) => t.key === params.tab) ?? TABS[0];
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const supabase = await createClient();

  // Tab-strip counts: one lightweight column, filtered the same way the active list is,
  // tallied in JS (no SQL grouping needed for a handful of statuses). company_facts already
  // filters out soft-deleted companies internally (no deleted_at column exposed).
  let countQuery = supabase.from("company_facts").select("lead_status");
  if (params.country) countQuery = countQuery.eq("country", params.country);
  if (params.state) countQuery = countQuery.ilike("state", `%${params.state}%`);
  if (params.city) countQuery = countQuery.ilike("city", `%${params.city}%`);
  const { data: countRows } = await countQuery;
  const counts: Record<string, number> = { New: 0, Qualified: 0, "Needs Review": 0, DisQualified: 0 };
  for (const row of countRows ?? []) counts[row.lead_status] = (counts[row.lead_status] ?? 0) + 1;

  const qs = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab: tab.key, country: params.country, state: params.state, city: params.city, ...overrides }))
      if (v) next.set(k, v);
    return `/review?${next.toString()}`;
  };

  let rows: {
    id: number;
    name: string;
    city: string | null;
    country: string | null;
    source?: string | null;
    created_at: string;
    prospect_tier?: string | null;
    qualification_summary?: string | null;
    last_researched?: string | null;
    identity_notes?: string | null;
    confidence_notes?: string | null;
    contact_stage?: number;
    primary_offer?: string | null;
  }[] = [];
  let total = 0;

  if (tab.key === "new") {
    let query = supabase
      .from("companies")
      .select("id, name, city, country, source, created_at", { count: "exact" })
      .eq("lead_status", "New")
      .is("deleted_at", null);
    if (params.country) query = query.eq("country", params.country);
    if (params.state) query = query.ilike("state", `%${params.state}%`);
    if (params.city) query = query.ilike("city", `%${params.city}%`);
    const { data, count } = await query.order("created_at", { ascending: true }).range(from, to);
    rows = data ?? [];
    total = count ?? 0;
  } else if (tab.key === "needs_review") {
    let query = supabase
      .from("companies")
      .select("id, name, city, country, created_at, last_researched, identity_notes, confidence_notes, qualification_summary", { count: "exact" })
      .eq("lead_status", "Needs Review")
      .is("deleted_at", null);
    if (params.country) query = query.eq("country", params.country);
    if (params.state) query = query.ilike("state", `%${params.state}%`);
    if (params.city) query = query.ilike("city", `%${params.city}%`);
    const { data, count } = await query.order("created_at", { ascending: true }).range(from, to);
    rows = data ?? [];
    total = count ?? 0;
  } else {
    let query = supabase
      .from("companies")
      .select("id, name, city, country, created_at, last_researched, prospect_tier, qualification_summary", { count: "exact" })
      .eq("lead_status", "Qualified")
      .is("deleted_at", null);
    if (params.country) query = query.eq("country", params.country);
    if (params.state) query = query.ilike("state", `%${params.state}%`);
    if (params.city) query = query.ilike("city", `%${params.city}%`);
    const { data, count } = await query.order("created_at", { ascending: true }).range(from, to);
    rows = data ?? [];
    total = count ?? 0;

    // Contact readiness and Primary Offer aren't on `companies` -- fetch for just this page's ids.
    const ids = rows.map((r) => r.id);
    if (ids.length) {
      const [{ data: facts }, { data: offers }] = await Promise.all([
        supabase.from("company_facts").select("id, contact_stage").in("id", ids),
        supabase.from("offer_recommendations").select("company_id, service").eq("type", "Primary").in("company_id", ids),
      ]);
      const stageById = new Map((facts ?? []).map((f) => [f.id, f.contact_stage]));
      const offerById = new Map((offers ?? []).map((o) => [o.company_id, o.service]));
      rows = rows.map((r) => ({ ...r, contact_stage: stageById.get(r.id), primary_offer: offerById.get(r.id) ?? null }));
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const READY_STAGE_LABEL: Record<number, string> = { 1: "No contact", 2: "No decision-maker", 3: "Not verified", 4: "Ready" };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Review Queue</h1>
        <p className="text-sm text-zinc-500">Walk leads through the pipeline: New → Qualified / Needs Review / DisQualified.</p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <input type="hidden" name="tab" value={tab.key} />
        {(["country", "state", "city"] as const).map((f) => (
          <div key={f} className="space-y-1">
            <label className="text-xs font-medium capitalize text-zinc-700">{f}</label>
            <input name={f} defaultValue={params[f]} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
          </div>
        ))}
        <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          Filter
        </button>
        {(params.country || params.state || params.city) && (
          <Link href={qs({ country: undefined, state: undefined, city: undefined })} className="text-sm text-zinc-500 hover:text-zinc-700">
            Clear
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={qs({ tab: t.key, page: undefined })}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab.key === t.key ? "border-b-2 border-zinc-900 text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label} ({counts[t.status] ?? 0})
          </Link>
        ))}
        <Link
          href={`/companies?${new URLSearchParams({ lead_status: "DisQualified", ...(params.country ? { country: params.country } : {}), ...(params.city ? { city: params.city } : {}) })}`}
          className="ml-auto rounded-t-md px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700"
        >
          DisQualified ({counts.DisQualified ?? 0}) →
        </Link>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Location</th>
            {tab.key === "new" && (
              <>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4 font-medium">Waiting</th>
              </>
            )}
            {tab.key === "qualified" && (
              <>
                <th className="py-2 pr-4 font-medium">Tier</th>
                <th className="py-2 pr-4 font-medium">Primary Offer</th>
                <th className="py-2 pr-4 font-medium">Contact Readiness</th>
                <th className="py-2 pr-4 font-medium">Summary</th>
                <th className="py-2 pr-4 font-medium">Researched</th>
              </>
            )}
            {tab.key === "needs_review" && (
              <>
                <th className="py-2 pr-4 font-medium">Why</th>
                <th className="py-2 pr-4 font-medium">Waiting</th>
                <th className="py-2 font-medium">Action</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const waitingDays = daysAgo(tab.key === "new" ? r.created_at : r.last_researched ?? r.created_at);
            return (
              <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                <td className="py-2 pr-4">
                  <Link href={`/companies/${r.id}`} className="font-medium text-zinc-900 hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-zinc-600">{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td>

                {tab.key === "new" && (
                  <>
                    <td className="py-2 pr-4 text-zinc-600">{r.source ?? "—"}</td>
                    <td className={`py-2 pr-4 tabular-nums ${ageColor(waitingDays, 3, 7)}`}>{ageLabel(waitingDays)}</td>
                  </>
                )}

                {tab.key === "qualified" && (
                  <>
                    <td className="py-2 pr-4 text-zinc-600">{r.prospect_tier ?? "—"}</td>
                    <td className="py-2 pr-4 text-zinc-600">{r.primary_offer ?? "—"}</td>
                    <td className="py-2 pr-4 text-zinc-600">{r.contact_stage ? READY_STAGE_LABEL[r.contact_stage] : "—"}</td>
                    <td className="max-w-xs truncate py-2 pr-4 text-zinc-600" title={r.qualification_summary ?? undefined}>
                      {r.qualification_summary ?? "—"}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-zinc-600">{ageLabel(waitingDays)} ago</td>
                  </>
                )}

                {tab.key === "needs_review" && (
                  <>
                    <td className="max-w-sm truncate py-2 pr-4 text-zinc-600" title={r.confidence_notes ?? r.identity_notes ?? undefined}>
                      {r.confidence_notes ?? r.identity_notes ?? r.qualification_summary ?? "—"}
                    </td>
                    <td className={`py-2 pr-4 tabular-nums ${ageColor(waitingDays, 2, 5)}`}>{ageLabel(waitingDays)}</td>
                    <td className="py-2">
                      <LeadStatusActions companyId={r.id} />
                    </td>
                  </>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-zinc-500">
                Nothing here.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ page: String(page - 1) })} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={qs({ page: String(page + 1) })} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

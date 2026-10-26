import Link from "next/link";
import { PAGE_SIZES, parseFilters, type SortKey } from "@/lib/companies/list-filters";
import { fetchCompanies, fetchFacets, fetchPipelineCounts } from "@/lib/companies/list-query";
import { timeAgo } from "@/lib/time-ago";
import { getCurrentUser } from "@/lib/current-user";
import { assignableUsers, canAssign } from "@/lib/assignment";
import { fetchWorkload } from "@/lib/companies/workload";
import { FiltersBar } from "./filters-bar";
import { statusChip } from "@/lib/pipeline-format";
import { verificationLabel } from "@/lib/verification";
import { HeaderCheck, RowCheck, SelectionBanner, SelectionProvider } from "./assignment";

export const dynamic = "force-dynamic";

const TIER_CHIP: Record<string, string> = {
  "Tier 1": "bg-violet-100 text-violet-800",
  "Tier 2": "bg-sky-100 text-sky-800",
  "Tier 3": "bg-zinc-100 text-zinc-700",
  "Do Not Pursue": "bg-red-100 text-red-700",
};

type RawParams = Record<string, string | string[] | undefined>;

// Current URL parameters with a few overrides, for sort / paging links.
function href(raw: RawParams, overrides: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (k in overrides || v === undefined) continue;
    (Array.isArray(v) ? v : [v]).forEach((x) => p.append(k, x));
  }
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) p.set(k, v);
  const qs = p.toString();
  return qs ? `/companies?${qs}` : "/companies";
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const f = parseFilters(raw);

  const [first, facets, actor, pipelineCounts] = await Promise.all([fetchCompanies(f), fetchFacets(), getCurrentUser(), fetchPipelineCounts(f)]);
  // Only team leads and admins can assign; for everyone else the page has no checkboxes or assign controls.
  const mayAssign = canAssign(actor);
  const isAdmin = actor?.role === "super_admin";
  const [assignUsers, workload] =
    mayAssign && actor ? await Promise.all([assignableUsers(actor), fetchWorkload(actor)]) : [[], null];
  const assignTeams = facets.teams.map((t) => ({ id: Number(t.value), name: t.label }));
  const teamNameById = new Map(assignTeams.map((t) => [t.id, t.name]));
  const assignPeople = assignUsers.map((u) => ({ id: u.id, name: u.name, teamName: u.team_id ? teamNameById.get(u.team_id) ?? null : null }));
  // The filters (without sort / paging) -- "select all matching" is applied server-side from these.
  const filtersQs = (() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) {
      if (["page", "sort", "dir", "size"].includes(k) || v === undefined) continue;
      (Array.isArray(v) ? v : [v]).forEach((x) => p.append(k, x));
    }
    return p.toString();
  })();
  const { total } = first;
  const totalPages = Math.max(1, Math.ceil(total / f.size));
  const page = Math.min(f.page, totalPages);
  // A page number beyond the end (stale link, filters narrowed) falls back to the last page.
  const { rows } = page === f.page ? first : await fetchCompanies({ ...f, page });
  const from = total === 0 ? 0 : (page - 1) * f.size + 1;
  const to = Math.min(page * f.size, total);

  // Header cell: click to sort; click again to reverse.
  const defaultDir: Record<SortKey, "asc" | "desc"> = {
    created: "desc", name: "asc", city: "asc", tier: "asc", status: "asc", owner: "asc", rating: "desc", rooms: "desc",
  };
  const sortTh = (label: string, sort: SortKey, className = "") => {
    const active = f.sort === sort;
    const nextDir = active ? (f.dir === "asc" ? "desc" : "asc") : defaultDir[sort];
    return (
      <th className={`px-3 py-3 ${className}`}>
        <Link href={href(raw, { sort, dir: nextDir, page: undefined })} className={`inline-flex items-center gap-1 ${active ? "text-zinc-900" : "hover:text-zinc-800"}`}>
          {label}
          <span className="text-[10px]">{active ? (f.dir === "asc" ? "▲" : "▼") : ""}</span>
        </Link>
      </th>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Companies</h1>
          <p className="text-sm text-zinc-500">
            {total.toLocaleString()} {total === 1 ? "company" : "companies"} · search, filter and sort everything in one place.
          </p>
        </div>
        <Link href="/companies/new" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800">
          New Company
        </Link>
      </div>

      {workload && (
        <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 text-sm font-medium text-zinc-800">
            <span>Workload</span>
            <span className="text-xs font-normal text-zinc-500">
              {isAdmin
                ? `${workload.unassignedToTeam.toLocaleString()} not yet given to a team`
                : `${workload.teams.reduce((n, t) => n + t.pool, 0).toLocaleString()} waiting in your team's pool`}
            </span>
          </summary>
          <div className="overflow-x-auto border-t border-zinc-100 px-5 py-4">
            {workload.teams.length === 0 && workload.people.length === 0 ? (
              <p className="text-sm text-zinc-500">No teams or people yet. Create teams under Users &rarr; Teams.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    <th className="py-2 pr-4">Team / person</th>
                    <th className="py-2 pr-4 text-right">Companies</th>
                    <th className="py-2 pr-4 text-right">Need verification</th>
                    <th className="py-2 text-right">Verified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {workload.teams.map((t) => (
                    <WorkloadTeam key={t.id} team={t} people={workload.people.filter((p) => p.team_name === t.name)} />
                  ))}
                  {workload.people.filter((p) => !p.team_name).map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 pr-4 text-zinc-700">{p.name} <span className="text-xs text-zinc-400">(no team)</span></td>
                      <td className="py-2 pr-4 text-right tabular-nums">{p.assigned}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{p.to_verify}</td>
                      <td className="py-2 text-right tabular-nums">{p.ready}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>
      )}

      {(() => {
        const body = (
          <>
          <FiltersBar facets={facets} counts={pipelineCounts} />

          {mayAssign && <SelectionBanner />}
          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  {mayAssign && (
                    <th className="w-10 py-3 pl-5 pr-0">
                      <HeaderCheck />
                    </th>
                  )}
                  {sortTh("Company", "name", mayAssign ? "pl-3" : "pl-5")}
                  {sortTh("Location", "city")}
                  <th className="px-3 py-3">Type</th>
                  {sortTh("Tier", "tier")}
                  {sortTh("Status", "status")}
                  <th className="px-3 py-3">Verification</th>
                  {sortTh("Owner", "owner")}
                  <th className="px-3 py-3">Team</th>
                  {sortTh("Google", "rating")}
                  {sortTh("Rooms", "rooms", "text-right")}
                  <th className="px-3 py-3 text-right">Contacts</th>
                  {sortTh("Added", "created", "pr-5")}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((c) => (
                  <tr key={c.id} className="align-top transition-colors hover:bg-zinc-50/70">
                    {mayAssign && (
                      <td className="w-10 py-3 pl-5 pr-0 align-top">
                        <RowCheck id={Number(c.id)} />
                      </td>
                    )}
                    <td className={`max-w-xs py-3 pr-3 ${mayAssign ? "pl-3" : "pl-5"}`}>
                      <Link href={`/companies/${c.id}`} className="font-medium text-sky-700 hover:underline">
                        {c.name}
                      </Link>
                      {c.parent_name && (
                        <Link href={`/companies/${c.parent_id}`} className="block truncate text-xs text-zinc-500 hover:underline">
                          Part of {c.parent_name}
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-700">
                      {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                      {c.country && <div className="text-xs text-zinc-500">{c.country}</div>}
                    </td>
                    <td className="px-3 py-3 text-zinc-700">
                      {c.property_type ?? c.company_type}
                      {(c.property_class || (c.property_type && c.company_type !== "Property")) && (
                        <div className="text-xs text-zinc-500">{c.property_class ?? c.company_type}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {c.prospect_tier ? (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${TIER_CHIP[c.prospect_tier] ?? "bg-zinc-100 text-zinc-700"}`}>{c.prospect_tier}</span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusChip(c.status_color)}`}>{c.status_name ?? "—"}</span>
                      {c.stage_name && <div className="mt-1 text-xs text-zinc-500">{c.stage_name}</div>}
                    </td>
                    <td className="px-3 py-3">
                      {c.verification_status ? (
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.verification_status === "Ready for Outreach" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                          {verificationLabel(c.verification_status)}
                        </span>
                      ) : c.status_name === "Qualified" || c.lead_status === "Qualified" ? (
                        <span className="text-xs text-zinc-400">Not verified</span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-zinc-700">{c.owner_name ?? <span className="text-zinc-400">Unassigned</span>}</td>
                    <td className="px-3 py-3 text-zinc-700">{c.team_name ?? <span className="text-zinc-400">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-zinc-700">
                      {c.google_rating === null ? (
                        "—"
                      ) : (
                        <>
                          {Number(c.google_rating).toFixed(1)}
                          {c.google_reviews !== null && <span className="text-xs text-zinc-400"> ({c.google_reviews.toLocaleString()})</span>}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-700">{c.rooms_units ?? "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-700">{c.contacts || "—"}</td>
                    <td className="whitespace-nowrap py-3 pl-3 pr-5 text-zinc-500" title={new Date(c.created_at).toUTCString()}>
                      {timeAgo(c.created_at)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={13} className="py-14 text-center text-zinc-500">
                      <p className="font-medium text-zinc-700">No companies match these filters.</p>
                      <Link href="/companies" className="mt-1 inline-block text-sm text-sky-700 hover:underline">
                        Clear all filters
                      </Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
            <div className="flex items-center gap-2">
              <span>Rows per page</span>
              {PAGE_SIZES.map((n) => (
                <Link
                  key={n}
                  href={href(raw, { size: String(n), page: undefined })}
                  className={`rounded-lg px-2.5 py-1 ${n === f.size ? "bg-zinc-900 font-medium text-white" : "border border-zinc-300 hover:bg-zinc-50"}`}
                >
                  {n}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span>
                {from.toLocaleString()}-{to.toLocaleString()} of {total.toLocaleString()}
              </span>
              {page > 1 ? (
                <Link href={href(raw, { page: String(page - 1) })} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                  &larr; Previous
                </Link>
              ) : (
                <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-300">&larr; Previous</span>
              )}
              <span className="px-1">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link href={href(raw, { page: String(page + 1) })} className="rounded-lg border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                  Next &rarr;
                </Link>
              ) : (
                <span className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-300">Next &rarr;</span>
              )}
            </div>
          </div>

          </>
        );
        return mayAssign ? (
          <SelectionProvider
            key={`${filtersQs}|${page}|${f.size}|${f.sort}${f.dir}`}
            pageIds={rows.map((r) => Number(r.id))}
            total={total}
            filtersQs={filtersQs}
            isAdmin={isAdmin}
            teams={assignTeams}
            people={assignPeople}
          >
            {body}
          </SelectionProvider>
        ) : (
          body
        );
      })()}
    </div>
  );
}

function WorkloadTeam({
  team,
  people,
}: {
  team: { id: number; name: string; total: number; pool: number };
  people: { id: number; name: string; role: string; assigned: number; to_verify: number; ready: number }[];
}) {
  return (
    <>
      <tr className="bg-zinc-50">
        <td className="py-2 pl-2 pr-4 font-medium text-zinc-900">{team.name}</td>
        <td className="py-2 pr-4 text-right font-medium tabular-nums">{team.total}</td>
        <td className="py-2 pr-4 text-right text-zinc-400">—</td>
        <td className="py-2 text-right text-zinc-400">—</td>
      </tr>
      <tr>
        <td className="py-2 pl-6 pr-4 text-zinc-500">Team pool (no person yet)</td>
        <td className="py-2 pr-4 text-right tabular-nums text-zinc-600">{team.pool}</td>
        <td className="py-2 pr-4" />
        <td className="py-2" />
      </tr>
      {people.map((p) => (
        <tr key={p.id}>
          <td className="py-2 pl-6 pr-4 text-zinc-700">
            {p.name} {p.role === "team_lead" && <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">Lead</span>}
          </td>
          <td className="py-2 pr-4 text-right tabular-nums">{p.assigned}</td>
          <td className="py-2 pr-4 text-right tabular-nums">{p.to_verify}</td>
          <td className="py-2 text-right tabular-nums">{p.ready}</td>
        </tr>
      ))}
    </>
  );
}

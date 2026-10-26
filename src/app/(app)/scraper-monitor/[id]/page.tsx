import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { timeAgo } from "@/lib/time-ago";
import { AutoRefresh } from "../auto-refresh";
import { BatchStatusButton } from "../batch-status-button";
import { abs, deriveState, fetchBatches, fetchLastPushes, pct } from "../data";
import { Card, Meter, StatusPill } from "../parts";
import { statusChip } from "@/lib/pipeline-format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

type CompanyRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  status_name: string | null;
  status_color: string | null;
  stage_name: string | null;
  created_at: Date;
  rating: string | null;
  review_count: number | null;
};

const hostOf = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/.*$/, "");

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "super_admin") redirect("/");

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const requestedPage = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;

  const [[b], lastPushes] = await Promise.all([fetchBatches(id), fetchLastPushes()]);
  if (!b) notFound();
  const { state, lastActivity } = deriveState(b, lastPushes.get(String(b.id)));

  const [{ total }] = await query<{ total: number }>(
    `SELECT count(*)::int AS total FROM companies c
      WHERE c.import_batch_id = $1 AND c.deleted_at IS NULL AND ($2 = '' OR c.name ILIKE $3 OR c.city ILIKE $3)`,
    [id, q, like]
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pages);
  const companies = await query<CompanyRow>(
    `SELECT c.id, c.name, c.city, c.state, c.phone, c.website, c.email, ps.name AS status_name, ps.color AS status_color, pst.name AS stage_name, c.created_at, r.rating, r.review_count
       FROM companies c
       LEFT JOIN pipeline_statuses ps ON ps.id = c.pipeline_status_id
       LEFT JOIN pipeline_stages pst ON pst.id = c.pipeline_stage_id
       LEFT JOIN LATERAL (
         SELECT rating, review_count FROM company_ratings
          WHERE company_id = c.id AND channel = 'google' ORDER BY captured_at DESC NULLS LAST LIMIT 1
       ) r ON true
      WHERE c.import_batch_id = $1 AND c.deleted_at IS NULL AND ($2 = '' OR c.name ILIKE $3 OR c.city ILIKE $3)
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $4 OFFSET $5`,
    [id, q, like, PAGE_SIZE, (page - 1) * PAGE_SIZE]
  );

  const href = (p: number) => `/scraper-monitor/${id}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const facts: { label: string; value: string }[] = [
    { label: "Country", value: b.country ?? "-" },
    { label: "State", value: b.state ?? "-" },
    { label: "City", value: b.city ?? "-" },
    { label: "Companies", value: b.companies.toLocaleString() },
    { label: "Last data", value: timeAgo(new Date(lastActivity)) },
    { label: "Created", value: timeAgo(b.created_at) },
  ];

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-6 px-8 py-8">
      <div className="flex items-center justify-between">
        <Link href="/scraper-monitor" className="text-sm font-medium text-sky-700 hover:underline">
          &larr; Scraper Monitor
        </Link>
        <AutoRefresh seconds={30} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{b.campaign_name}</h1>
            <StatusPill state={state} />
          </div>
          <p className="text-sm text-slate-500">
            {b.campaign_id}
            {b.status === "completed" && b.origin === "scraper" && (
              <span title={abs(b.completed_at)}>
                {" "}
                · {b.completed_by ? "Closed by an admin" : "Closed by scraper"} {timeAgo(b.completed_at)}
              </span>
            )}
          </p>
        </div>
        {b.status === "open" && <BatchStatusButton id={Number(b.id)} name={b.campaign_name} />}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {facts.map((f) => (
          <Card key={f.label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{f.label}</p>
            <p className="mt-1.5 truncate text-lg font-semibold text-slate-900">{f.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Notes</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{b.notes ?? "No notes."}</p>
        </Card>
        <Card className="space-y-2 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Data completeness</p>
          <Meter label="Website" value={pct(b.with_website, b.companies)} />
          <Meter label="Phone" value={pct(b.with_phone, b.companies)} />
          <Meter label="Email" value={pct(b.with_email, b.companies)} />
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Companies <span className="font-normal text-slate-500">({total.toLocaleString()}{q ? ` matching "${q}"` : ""})</span>
          </h2>
          <form method="get" className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name or city"
              className="w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
            />
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
              Search
            </button>
            {q && (
              <Link href={`/scraper-monitor/${id}`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Clear
              </Link>
            )}
          </form>
        </div>

        <Card className="overflow-x-auto">
          {companies.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              {q ? "No companies match that search." : "No companies in this campaign yet."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-3 py-3">City</th>
                  <th className="px-3 py-3">State</th>
                  <th className="px-3 py-3">Phone</th>
                  <th className="px-3 py-3">Website</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Google</th>
                  <th className="px-3 py-3">Lead status</th>
                  <th className="px-5 py-3">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <Link href={`/companies/${c.id}`} className="font-medium text-sky-700 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{c.city ?? "-"}</td>
                    <td className="px-3 py-3 text-slate-700">{c.state ?? "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">{c.phone ?? "-"}</td>
                    <td className="max-w-[14rem] truncate px-3 py-3">
                      {c.website ? (
                        <a href={/^https?:/i.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="text-slate-700 hover:text-sky-700 hover:underline">
                          {hostOf(c.website)}
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-3 text-slate-700">{c.email ?? "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                      {c.rating === null ? "-" : (
                        <>
                          {Number(c.rating).toFixed(1)}
                          {c.review_count !== null && <span className="text-slate-400"> ({c.review_count.toLocaleString()})</span>}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusChip(c.status_color)}`}>{c.status_name ?? "—"}</span>
                      {c.stage_name && <div className="mt-1 text-xs text-slate-500">{c.stage_name}</div>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-500" title={abs(c.created_at)}>
                      {timeAgo(c.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {total > 0 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>
              Showing {from.toLocaleString()}-{to.toLocaleString()} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link href={href(page - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                  &larr; Previous
                </Link>
              ) : (
                <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-300">&larr; Previous</span>
              )}
              <span className="px-2">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link href={href(page + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                  Next &rarr;
                </Link>
              ) : (
                <span className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-300">Next &rarr;</span>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

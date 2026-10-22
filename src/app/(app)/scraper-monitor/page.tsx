import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { timeAgo } from "@/lib/time-ago";
import { AutoRefresh } from "./auto-refresh";
import { BatchStatusButton } from "./batch-status-button";

export const dynamic = "force-dynamic";

const RECEIVING_MS = 15 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;

type BatchRow = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  country: string | null;
  state: string | null;
  city: string | null;
  notes: string | null;
  origin: "scraper" | "backfill";
  status: "open" | "completed";
  completed_at: Date | null;
  created_at: Date;
  companies: number;
  last_company: Date | null;
  with_website: number;
  with_phone: number;
  with_email: number;
};
type PushStat = { batch_id: string; pushes: number; skipped: number; last_push: Date };
type PushRow = {
  id: string;
  created_at: Date;
  campaign_id: string | null;
  campaign_name: string | null;
  outcome: "ok" | "partial" | "failed" | "unauthorized";
  received: number;
  created: number;
  skipped: number;
  error: string | null;
};

type BatchState = "receiving" | "active" | "stale" | "completed";

const STATE_BADGE: Record<BatchState, { label: string; className: string }> = {
  receiving: { label: "Receiving", className: "bg-green-100 text-green-800" },
  active: { label: "Active", className: "bg-blue-100 text-blue-800" },
  stale: { label: "Stale", className: "bg-amber-100 text-amber-800" },
  completed: { label: "Completed", className: "bg-zinc-100 text-zinc-600" },
};
const OUTCOME_BADGE: Record<PushRow["outcome"], { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-green-100 text-green-800" },
  partial: { label: "Some skipped", className: "bg-amber-100 text-amber-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
  unauthorized: { label: "Bad key", className: "bg-red-100 text-red-800" },
};

const pct = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)}%` : "-");
const area = (b: BatchRow) => [b.city, b.state, b.country].filter(Boolean).join(", ") || "-";
const abs = (d: Date | null) => (d ? new Date(d).toUTCString() : "");

export default async function ScraperMonitorPage() {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "super_admin") redirect("/");

  const [batches, pushStats, pushes, facts, failures, orphans, lastScraped] = await Promise.all([
    query<BatchRow>(`
      SELECT b.id, b.campaign_id, b.campaign_name, b.country, b.state, b.city, b.notes, b.origin, b.status,
             b.completed_at, b.created_at,
             count(c.id)::int AS companies, max(c.created_at) AS last_company,
             count(c.website)::int AS with_website, count(c.phone)::int AS with_phone, count(c.email)::int AS with_email
        FROM import_batches b
        LEFT JOIN companies c ON c.import_batch_id = b.id AND c.deleted_at IS NULL
       GROUP BY b.id
       ORDER BY greatest(max(c.created_at), b.created_at) DESC`),
    query<PushStat>(`
      SELECT batch_id, count(*)::int AS pushes, coalesce(sum(skipped), 0)::int AS skipped, max(created_at) AS last_push
        FROM import_push_log WHERE batch_id IS NOT NULL GROUP BY batch_id`),
    query<PushRow>(`
      SELECT l.id, l.created_at, l.campaign_id, b.campaign_name, l.outcome, l.received, l.created, l.skipped, l.error
        FROM import_push_log l LEFT JOIN import_batches b ON b.id = l.batch_id
       ORDER BY l.created_at DESC LIMIT 20`),
    query<{ h1: number; h24: number; d7: number }>(`
      SELECT count(*) FILTER (WHERE c.created_at > now() - interval '1 hour')::int AS h1,
             count(*) FILTER (WHERE c.created_at > now() - interval '24 hours')::int AS h24,
             count(*) FILTER (WHERE c.created_at > now() - interval '7 days')::int AS d7
        FROM companies c JOIN import_batches b ON b.id = c.import_batch_id
       WHERE b.origin = 'scraper' AND c.deleted_at IS NULL`),
    query<{ failed: number; partial: number; skipped: number; last_error: string | null; last_error_at: Date | null }>(`
      SELECT count(*) FILTER (WHERE outcome IN ('failed','unauthorized'))::int AS failed,
             count(*) FILTER (WHERE outcome = 'partial')::int AS partial,
             coalesce(sum(skipped), 0)::int AS skipped,
             (array_agg(error ORDER BY created_at DESC) FILTER (WHERE error IS NOT NULL))[1] AS last_error,
             max(created_at) FILTER (WHERE error IS NOT NULL) AS last_error_at
        FROM import_push_log WHERE created_at > now() - interval '24 hours'`),
    query<{ n: number }>(`
      SELECT count(*)::int AS n FROM companies
       WHERE source = 'google_maps' AND import_batch_id IS NULL AND deleted_at IS NULL`),
    query<{ created_at: Date; campaign_name: string }>(`
      SELECT c.created_at, b.campaign_name FROM companies c JOIN import_batches b ON b.id = c.import_batch_id
       WHERE b.origin = 'scraper' ORDER BY c.created_at DESC LIMIT 1`),
  ]);

  const now = Date.now();
  const statsByBatch = new Map(pushStats.map((p) => [String(p.batch_id), p]));
  const rows = batches.map((b) => {
    const stat = statsByBatch.get(String(b.id));
    // Last real data: newest company or push. A batch that has neither yet falls back to when it
    // was created (so a brand-new empty campaign isn't instantly "stale").
    const lastActivity =
      Math.max(b.last_company ? new Date(b.last_company).getTime() : 0, stat ? new Date(stat.last_push).getTime() : 0) ||
      new Date(b.created_at).getTime();
    const state: BatchState =
      b.status === "completed"
        ? "completed"
        : now - lastActivity < RECEIVING_MS
          ? "receiving"
          : now - lastActivity < STALE_MS
            ? "active"
            : "stale";
    // New companies landing in a batch an admin already closed.
    const dataAfterCompleted =
      b.status === "completed" && b.origin === "scraper" && b.completed_at && b.last_company &&
      new Date(b.last_company) > new Date(b.completed_at);
    return { b, stat, lastActivity, state, dataAfterCompleted: Boolean(dataAfterCompleted) };
  });

  const staleBatches = rows.filter((r) => r.state === "stale" && r.b.origin === "scraper");
  const afterCompleted = rows.filter((r) => r.dataAfterCompleted);
  const f = facts[0];
  const fail = failures[0];
  const orphanCount = orphans[0]?.n ?? 0;
  const last = lastScraped[0];
  const receiving = last && now - new Date(last.created_at).getTime() < RECEIVING_MS;

  const attention: { key: string; text: string }[] = [];
  if (fail.failed > 0) {
    attention.push({
      key: "failed",
      text: `${fail.failed} push${fail.failed === 1 ? "" : "es"} failed in the last 24h. Latest error (${timeAgo(fail.last_error_at)}): ${fail.last_error}`,
    });
  }
  if (fail.partial > 0) {
    attention.push({ key: "partial", text: `${fail.skipped} record${fail.skipped === 1 ? "" : "s"} skipped across ${fail.partial} push${fail.partial === 1 ? "" : "es"} in the last 24h.` });
  }
  if (orphanCount > 0) {
    attention.push({ key: "orphans", text: `${orphanCount} scraper company${orphanCount === 1 ? " has" : "ies have"} no campaign. Check that gscraper sends campaign_id.` });
  }
  for (const r of staleBatches) {
    attention.push({ key: `stale-${r.b.id}`, text: `"${r.b.campaign_name}" has received nothing for ${timeAgo(new Date(r.lastActivity)).replace(" ago", "")}. Mark it completed if it's finished.` });
  }
  for (const r of afterCompleted) {
    attention.push({ key: `after-${r.b.id}`, text: `"${r.b.campaign_name}" was marked completed but received new companies ${timeAgo(r.b.last_company)}. Reopen it or check gscraper.` });
  }

  const banner =
    fail.failed > 0
      ? { tone: "red", title: "Problems in the last 24 hours", detail: "Some pushes from gscraper were rejected." }
      : receiving
        ? { tone: "green", title: "Receiving data now", detail: `Last company ${timeAgo(last.created_at)} (${last.campaign_name}).` }
        : attention.length > 0
          ? { tone: "amber", title: "Needs attention", detail: last ? `Last company ${timeAgo(last.created_at)}.` : "No scraper data received yet." }
          : f.h24 > 0
            ? { tone: "green", title: "Healthy", detail: `Last company ${timeAgo(last.created_at)} (${last.campaign_name}).` }
            : { tone: "zinc", title: "Idle", detail: last ? `Last company ${timeAgo(last.created_at)}. Nothing wrong, the scraper is just quiet.` : "No scraper data received yet." };
  const tone = {
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    green: "border-green-200 bg-green-50 text-green-900",
    zinc: "border-zinc-200 bg-zinc-50 text-zinc-800",
  }[banner.tone];

  const tiles: { label: string; value: string; hint?: string }[] = [
    { label: "Last company received", value: timeAgo(last?.created_at), hint: last?.campaign_name },
    { label: "Last hour", value: String(f.h1), hint: "companies" },
    { label: "Last 24 hours", value: String(f.h24), hint: "companies" },
    { label: "Last 7 days", value: String(f.d7), hint: "companies" },
    { label: "Open campaigns", value: String(rows.filter((r) => r.b.origin === "scraper" && r.b.status === "open").length), hint: `${staleBatches.length} stale` },
    { label: "Problems (24h)", value: String(fail.failed + fail.partial), hint: `${fail.skipped} skipped records` },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Scraper Monitor</h1>
          <p className="text-sm text-zinc-500">Data pushed into the CRM by gscraper, and whether the pipeline is healthy.</p>
        </div>
        <AutoRefresh seconds={30} />
      </div>

      <div className={`rounded-lg border px-5 py-4 ${tone}`}>
        <p className="font-semibold">{banner.title}</p>
        <p className="text-sm">{banner.detail}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">{t.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{t.value}</p>
            {t.hint && <p className="truncate text-xs text-zinc-500">{t.hint}</p>}
          </div>
        ))}
      </div>

      {attention.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-900">Needs attention</h2>
          <ul className="space-y-1.5">
            {attention.map((a) => (
              <li key={a.key} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {a.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">Campaigns (batches)</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="px-3 py-2 font-medium">Campaign</th>
                <th className="px-3 py-2 font-medium">Target area</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Companies</th>
                <th className="px-3 py-2 font-medium">Last data</th>
                <th className="px-3 py-2 font-medium">Skipped</th>
                <th className="px-3 py-2 font-medium" title="Share of companies with a website / phone / email">Web / Phone / Email</th>
                <th className="px-3 py-2 font-medium">Notes</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, stat, lastActivity, state }) => {
                const badge = STATE_BADGE[state];
                return (
                  <tr key={b.id} className="border-b border-zinc-100 align-top last:border-0">
                    <td className="px-3 py-3">
                      <p className="font-medium text-zinc-900">{b.campaign_name}</p>
                      <p className="text-xs text-zinc-500">
                        {b.campaign_id}
                        {b.origin === "backfill" && <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">Backfill</span>}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{area(b)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="px-3 py-3 text-zinc-900">{b.companies.toLocaleString()}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-zinc-600" title={abs(new Date(lastActivity))}>
                      {timeAgo(new Date(lastActivity))}
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{stat ? stat.skipped : "-"}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-zinc-600">
                      {pct(b.with_website, b.companies)} / {pct(b.with_phone, b.companies)} / {pct(b.with_email, b.companies)}
                    </td>
                    <td className="max-w-xs px-3 py-3 text-xs text-zinc-500" title={b.notes ?? ""}>
                      <p className="line-clamp-2">{b.notes ?? "-"}</p>
                    </td>
                    <td className="px-3 py-3">
                      <BatchStatusButton id={Number(b.id)} status={b.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500">
          Receiving = data in the last 15 minutes. Active = data in the last 24 hours. Stale = open campaign with nothing for 24 hours.
          Completed is set by an admin after checking the batch. Backfill = existing companies grouped after the fact.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-900">Recent pushes</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          {pushes.length === 0 ? (
            <p className="px-3 py-4 text-sm text-zinc-500">No pushes recorded yet. Every call to the import API from now on appears here.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500">
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Campaign</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Received</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Skipped</th>
                  <th className="px-3 py-2 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {pushes.map((p) => {
                  const badge = OUTCOME_BADGE[p.outcome];
                  return (
                    <tr key={p.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-600" title={abs(p.created_at)}>{timeAgo(p.created_at)}</td>
                      <td className="px-3 py-2 text-zinc-900">{p.campaign_name ?? p.campaign_id ?? <span className="text-zinc-400">none</span>}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                      </td>
                      <td className="px-3 py-2 text-zinc-600">{p.received}</td>
                      <td className="px-3 py-2 text-zinc-600">{p.created}</td>
                      <td className="px-3 py-2 text-zinc-600">{p.skipped}</td>
                      <td className="max-w-xs truncate px-3 py-2 text-xs text-zinc-500" title={p.error ?? ""}>{p.error ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

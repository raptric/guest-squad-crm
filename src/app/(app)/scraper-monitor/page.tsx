import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { timeAgo, timeAgoShort } from "@/lib/time-ago";
import { AutoRefresh } from "./auto-refresh";
import { BatchStatusButton } from "./batch-status-button";
import { abs, deriveState, fetchBatches, fetchLastPushes, pct, RECEIVING_MS } from "./data";
import { BackfillPill, Card, Meter, Pill, StatusPill } from "./parts";
import { LEGEND, type Tone } from "./status";

export const dynamic = "force-dynamic";

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

const OUTCOME: Record<PushRow["outcome"], Tone> = {
  ok: { label: "OK", badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500", card: "" },
  partial: { label: "Some skipped", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500", card: "" },
  failed: { label: "Failed", badge: "bg-red-100 text-red-800", dot: "bg-red-500", card: "" },
  unauthorized: { label: "Bad key", badge: "bg-red-100 text-red-800", dot: "bg-red-500", card: "" },
};

const BANNER = {
  red: { box: "border-red-200 bg-red-50 text-red-900", dot: "bg-red-500" },
  amber: { box: "border-amber-200 bg-amber-50 text-amber-900", dot: "bg-amber-500" },
  green: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", dot: "bg-emerald-500" },
  slate: { box: "border-slate-200 bg-slate-50 text-slate-800", dot: "bg-slate-400" },
};

export default async function ScraperMonitorPage() {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "super_admin") redirect("/");

  const [batches, lastPushes, pushes, facts, failures, orphans, lastScraped] = await Promise.all([
    fetchBatches(),
    fetchLastPushes(),
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
  const rows = batches.map((b) => ({ b, ...deriveState(b, lastPushes.get(String(b.id)), now) }));
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
    attention.push({ key: `after-${r.b.id}`, text: `"${r.b.campaign_name}" was completed but received new companies ${timeAgo(r.b.last_company)}. Check gscraper.` });
  }

  const banner =
    fail.failed > 0
      ? { tone: "red" as const, title: "Problems in the last 24 hours", detail: "Some pushes from gscraper were rejected. Details below." }
      : receiving
        ? { tone: "green" as const, title: "Receiving data now", detail: `Last company ${timeAgo(last.created_at)} (${last.campaign_name}).` }
        : attention.length > 0
          ? { tone: "amber" as const, title: "Needs attention", detail: last ? `Last company ${timeAgo(last.created_at)}.` : "No scraper data received yet." }
          : f.h24 > 0
            ? { tone: "green" as const, title: "All healthy", detail: `Last company ${timeAgo(last.created_at)} (${last.campaign_name}).` }
            : { tone: "slate" as const, title: "Quiet right now", detail: last ? `Last company ${timeAgo(last.created_at)}. Nothing is wrong, the scraper is just idle.` : "No scraper data received yet." };

  const tiles = [
    { label: "Last company", value: timeAgoShort(last?.created_at), hint: last?.campaign_name ?? "No data yet" },
    { label: "Last hour", value: String(f.h1), hint: "companies received" },
    { label: "Last 24 hours", value: String(f.h24), hint: "companies received" },
    { label: "Last 7 days", value: String(f.d7), hint: "companies received" },
    { label: "Open campaigns", value: String(rows.filter((r) => r.b.origin === "scraper" && r.b.status === "open").length), hint: `${staleBatches.length} stale` },
    { label: "Problems today", value: String(fail.failed + fail.partial), hint: fail.failed + fail.partial === 0 ? "all clear" : "see below" },
  ];

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-8 px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Scraper Monitor</h1>
          <p className="text-sm text-slate-500">Everything gscraper pushes into the CRM, and whether the pipeline is healthy.</p>
        </div>
        <AutoRefresh seconds={30} />
      </div>

      <div className={`flex items-center gap-4 rounded-2xl border px-6 py-5 ${BANNER[banner.tone].box}`}>
        <span className="relative flex h-3 w-3 shrink-0">
          {banner.tone === "green" && receiving && (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${BANNER[banner.tone].dot}`} />
          )}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${BANNER[banner.tone].dot}`} />
        </span>
        <div>
          <p className="text-lg font-semibold">{banner.title}</p>
          <p className="text-sm opacity-80">{banner.detail}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <Card key={t.label} className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t.label}</p>
            <p className="mt-2 whitespace-nowrap text-2xl font-semibold text-slate-900">{t.value}</p>
            <p className="mt-0.5 truncate text-sm text-slate-500">{t.hint}</p>
          </Card>
        ))}
      </div>

      {attention.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Needs attention</h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {attention.map((a) => (
              <div key={a.key} className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <p>{a.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Campaigns</h2>
          <p className="text-sm text-slate-500">Click a campaign name to see every company it brought in.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {LEGEND.map(({ tone, text }) => (
            <div key={tone.label} className={`space-y-2 rounded-xl border p-4 ${tone.card}`}>
              <Pill tone={tone} />
              <p className="text-sm leading-snug text-slate-600">{text}</p>
            </div>
          ))}
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3">Campaign</th>
                <th className="px-3 py-3">Country</th>
                <th className="px-3 py-3">State</th>
                <th className="px-3 py-3">City</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Companies</th>
                <th className="px-3 py-3">Last data</th>
                <th className="px-3 py-3">Data completeness</th>
                <th className="px-3 py-3">Notes</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ b, lastActivity, state }) => (
                <tr key={b.id} className="align-top transition-colors hover:bg-slate-50/70">
                  <td className="px-5 py-4">
                    <Link href={`/scraper-monitor/${b.id}`} className="font-semibold text-sky-700 hover:underline">
                      {b.campaign_name}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      {b.campaign_id}
                      {b.origin === "backfill" && <BackfillPill />}
                    </p>
                  </td>
                  <td className="px-3 py-4 text-slate-700">{b.country ?? "-"}</td>
                  <td className="px-3 py-4 text-slate-700">{b.state ?? "-"}</td>
                  <td className="px-3 py-4 text-slate-700">{b.city ?? "-"}</td>
                  <td className="px-3 py-4">
                    <StatusPill state={state} />
                    {b.status === "completed" && b.origin === "scraper" && (
                      <p className="mt-1.5 text-xs text-slate-500" title={abs(b.completed_at)}>
                        {b.completed_by ? "Closed by an admin" : "Closed by scraper"} {timeAgo(b.completed_at)}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-4 text-right font-medium tabular-nums text-slate-900">{b.companies.toLocaleString()}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-600" title={abs(new Date(lastActivity))}>
                    {timeAgo(new Date(lastActivity))}
                  </td>
                  <td className="px-3 py-4">
                    <div className="space-y-1">
                      <Meter label="Website" value={pct(b.with_website, b.companies)} />
                      <Meter label="Phone" value={pct(b.with_phone, b.companies)} />
                      <Meter label="Email" value={pct(b.with_email, b.companies)} />
                    </div>
                  </td>
                  <td className="max-w-sm px-3 py-4 text-xs text-slate-500" title={b.notes ?? ""}>
                    <p className="line-clamp-2">{b.notes ?? "-"}</p>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {b.status === "open" && <BatchStatusButton id={Number(b.id)} name={b.campaign_name} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Recent pushes</h2>
        <Card className="overflow-x-auto">
          {pushes.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No pushes recorded yet. Every call to the import API from now on appears here.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">When</th>
                  <th className="px-3 py-3">Campaign</th>
                  <th className="px-3 py-3">Result</th>
                  <th className="px-3 py-3 text-right">Received</th>
                  <th className="px-3 py-3 text-right">Created</th>
                  <th className="px-3 py-3 text-right">Skipped</th>
                  <th className="px-5 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pushes.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600" title={abs(p.created_at)}>{timeAgo(p.created_at)}</td>
                    <td className="px-3 py-3 text-slate-900">{p.campaign_name ?? p.campaign_id ?? <span className="text-slate-400">none</span>}</td>
                    <td className="px-3 py-3"><Pill tone={OUTCOME[p.outcome]} /></td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">{p.received}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">{p.created}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">{p.skipped}</td>
                    <td className="max-w-xl truncate px-5 py-3 text-xs text-slate-500" title={p.error ?? ""}>{p.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}

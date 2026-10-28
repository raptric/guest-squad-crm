import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchCampaign } from "@/lib/campaigns";
import { fetchEnrollmentList, fetchPeople, fetchStats, fetchTeams, normalizeScope, scopesFor, type Scope, type StatusFilter } from "@/lib/campaign-enrollments";
import { CAMPAIGN_STATUS_CHIP, CAMPAIGN_STATUS_LABEL, CHANNEL_CHIP, DUE_TONE, dueInfo, formatDate, todayUtc } from "@/lib/campaigns-format";
import { FIT_CHIP, FIT_TEXT } from "@/lib/campaign-fit-format";
import { timeAgo } from "@/lib/time-ago";
import { CampaignTabs } from "../../campaign-tabs";
import { StopEnrollment } from "./stop-enrollment";

export const dynamic = "force-dynamic";

const SIZE = 25;
type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, key: string) => {
  const v = raw[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);
const SCOPE_LABEL: Record<Scope, string> = { mine: "Mine", team: "My team", all: "Everyone" };
const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "running", label: "Running" },
  { key: "completed", label: "Completed" },
  { key: "stopped", label: "Stopped" },
  { key: "all", label: "All" },
];

// Who is in this campaign and how they are doing. Every number is limited to the companies you may see, then to the scope you pick.
export default async function CampaignEnrollmentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Raw> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const campaign = await fetchCampaign(id, user);
  if (!campaign) notFound();

  const raw = await searchParams;
  const scope = normalizeScope(user, one(raw, "scope"));
  const status = (STATUS_TABS.find((t) => t.key === one(raw, "status"))?.key ?? "running") as StatusFilter;
  const fit = (["strong", "partial", "weak"] as const).find((f) => f === one(raw, "fit")) ?? null;
  const q = one(raw, "q").trim().slice(0, 100);
  const page = Math.max(1, parseInt(one(raw, "page"), 10) || 1);
  const ownerId = user.role === "user" ? null : num(one(raw, "owner"));
  const teamId = user.role === "super_admin" ? num(one(raw, "team")) : null;
  const filters = { scope, ownerId, teamId };

  const [stats, people, teams, list] = await Promise.all([
    fetchStats(user, Number(id), filters),
    fetchPeople(user, Number(id), scope),
    fetchTeams(user, Number(id), scope),
    fetchEnrollmentList(user, Number(id), filters, { status, fit, q, page, size: SIZE }),
  ]);

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = {
      scope: scope === normalizeScope(user, undefined) ? "" : scope,
      status: status === "running" ? "" : status,
      fit: fit ?? "",
      q,
      owner: ownerId ? String(ownerId) : "",
      team: teamId ? String(teamId) : "",
      page: page > 1 ? String(page) : "",
    };
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return `/campaigns/${id}/enrollments${s ? `?${s}` : ""}`;
  };
  const finished = stats.completed + stats.stopped;
  const rate = finished > 0 ? `${Math.round((stats.completed / finished) * 100)}%` : "—";
  const pages = Math.max(1, Math.ceil(list.total / SIZE));
  const today = todayUtc();
  const scopes = scopesFor(user);
  const pickedPerson = ownerId ? people.find((p) => p.owner_id === String(ownerId))?.name : null;
  const pickedTeam = teamId ? teams.find((t) => t.team_id === String(teamId))?.name : null;

  const tile = (label: string, value: string | number, tone = "text-zinc-900") => (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-8">
      <div>
        <Link href="/campaigns" className="text-sm text-zinc-500 hover:text-zinc-800">
          &larr; Back to Campaigns
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
          {campaign.name}
          <span className={`ml-3 rounded-full px-2.5 py-1 align-middle text-xs font-medium ${CAMPAIGN_STATUS_CHIP[campaign.status]}`}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          <span className="font-mono text-xs">{campaign.code}</span> · Owner: {campaign.owner_name ?? "none"}
        </p>
      </div>
      <CampaignTabs id={id} active="enrollments" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {user.role === "user"
            ? "These are your companies in this campaign."
            : scope === "all"
              ? "Every company in this campaign."
              : scope === "team"
                ? "Your team's companies in this campaign, including yours."
                : "Only your own companies in this campaign."}
          {pickedPerson ? ` Showing ${pickedPerson}.` : ""}
          {pickedTeam ? ` Showing ${pickedTeam}.` : ""}
        </p>
        {scopes.length > 1 && (
          <div className="flex gap-2">
            {scopes.map((s) => (
              <Link
                key={s}
                href={qs({ scope: s === normalizeScope(user, undefined) ? "" : s, owner: "", team: "", page: "" })}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${scope === s ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"}`}
              >
                {SCOPE_LABEL[s]}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tile("Enrolled", stats.enrolled)}
        {tile("Running", stats.running, "text-emerald-700")}
        {tile("Completed", stats.completed, "text-sky-700")}
        {tile("Stopped", stats.stopped)}
        {tile("Overdue tasks", stats.overdue, stats.overdue > 0 ? "text-red-700" : "text-zinc-900")}
        {tile("Completion rate", rate)}
      </div>

      {teams.length > 0 && (
        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <h2 className="px-5 pt-4 text-sm font-semibold text-zinc-900">By team</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
                <th className="px-5 py-2">Team</th>
                <th className="px-3 py-2 text-right">Enrolled</th>
                <th className="px-3 py-2 text-right">Running</th>
                <th className="px-3 py-2 text-right">Completed</th>
                <th className="px-3 py-2 text-right">Stopped</th>
                <th className="px-5 py-2 text-right">Overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {teams.map((t) => (
                <tr key={t.team_id ?? "none"} className="hover:bg-zinc-50/70">
                  <td className="px-5 py-2.5">
                    {t.team_id ? (
                      <Link href={qs({ team: t.team_id, owner: "", page: "" })} className="font-medium text-sky-700 hover:underline">
                        {t.name}
                      </Link>
                    ) : (
                      <span className="text-zinc-600">{t.name}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.enrolled}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.running}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.completed}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{t.stopped}</td>
                  <td className={`px-5 py-2.5 text-right tabular-nums ${t.overdue ? "font-semibold text-red-700" : ""}`}>{t.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {people.length > 0 && (
        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <h2 className="px-5 pt-4 text-sm font-semibold text-zinc-900">By person</h2>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
                <th className="px-5 py-2">Person</th>
                <th className="px-3 py-2 text-right">Enrolled</th>
                <th className="px-3 py-2 text-right">Running</th>
                <th className="px-3 py-2 text-right">Completed</th>
                <th className="px-3 py-2 text-right">Stopped</th>
                <th className="px-5 py-2 text-right">Overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {people.map((p) => (
                <tr key={p.owner_id ?? "none"} className={`hover:bg-zinc-50/70 ${ownerId && p.owner_id === String(ownerId) ? "bg-sky-50/60" : ""}`}>
                  <td className="px-5 py-2.5">
                    {p.owner_id ? (
                      <Link href={qs({ owner: p.owner_id, page: "" })} className="font-medium text-sky-700 hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="text-zinc-600">{p.name}</span>
                    )}
                    {p.team_name && <span className="ml-2 text-xs text-zinc-400">{p.team_name}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.enrolled}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.running}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.completed}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.stopped}</td>
                  <td className={`px-5 py-2.5 text-right tabular-nums ${p.overdue ? "font-semibold text-red-700" : ""}`}>{p.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((t) => (
            <Link
              key={t.key}
              href={qs({ status: t.key === "running" ? "" : t.key, page: "" })}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${status === t.key ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form action={`/campaigns/${id}/enrollments`} className="flex flex-wrap items-center gap-2">
          {scope !== normalizeScope(user, undefined) && <input type="hidden" name="scope" value={scope} />}
          {status !== "running" && <input type="hidden" name="status" value={status} />}
          {ownerId && <input type="hidden" name="owner" value={ownerId} />}
          {teamId && <input type="hidden" name="team" value={teamId} />}
          <select name="fit" defaultValue={fit ?? ""} className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm" aria-label="Fit">
            <option value="">Any fit</option>
            <option value="strong">Strong fit</option>
            <option value="partial">Partial fit</option>
            <option value="weak">Weak fit</option>
          </select>
          <input name="q" defaultValue={q} placeholder="Search company…" className="w-48 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm" />
          <button type="submit" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Filter
          </button>
          {(ownerId || teamId || fit || q) && (
            <Link href={qs({ owner: "", team: "", fit: "", q: "", page: "" })} className="text-sm text-zinc-500 hover:text-zinc-800">
              Clear
            </Link>
          )}
        </form>
      </div>

      {list.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <p className="font-medium text-zinc-800">No enrollments to show</p>
          <p className="mt-1 text-sm text-zinc-500">
            {stats.enrolled === 0 ? "No company you can see is in this campaign yet. Enroll a company from its page, or from Companies that fit." : "Nothing matches these filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3">Company</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">Enrolled</th>
                <th className="px-3 py-3">Progress</th>
                <th className="px-3 py-3">Next step</th>
                <th className="px-3 py-3">Fit</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.rows.map((e) => {
                const due = e.next_due ? dueInfo(e.next_due, today) : null;
                const onHold = e.status === "active" && e.campaign_status === "paused";
                return (
                  <tr key={e.id} className="align-top hover:bg-zinc-50/70">
                    <td className="px-5 py-3">
                      <Link href={`/companies/${e.company_id}`} className="font-medium text-sky-700 hover:underline">
                        {e.company_name}
                      </Link>
                      <p className="max-w-xs truncate text-xs text-zinc-500">{e.recipient_label}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-zinc-600">{e.owner_name ?? "No owner"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-500">
                      {e.enrolled_by_name ?? "Someone"}
                      <br />
                      {timeAgo(e.enrolled_at)} · starts {formatDate(e.start_date)}
                    </td>
                    <td className="px-3 py-3">
                      <details className="text-xs">
                        <summary className="cursor-pointer select-none font-medium text-zinc-700 hover:text-zinc-900">
                          {e.steps_done} of {e.steps_total}
                          <span className="ml-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200 align-middle">
                            <span className="block h-full bg-emerald-500" style={{ width: `${e.steps_total ? (e.steps_done / e.steps_total) * 100 : 0}%` }} />
                          </span>
                        </summary>
                        <ol className="mt-2 w-72 space-y-1.5 rounded-lg bg-zinc-50 p-2.5">
                          {e.tasks.map((t) => (
                            <li key={t.step_position} className={t.status === "cancelled" ? "opacity-50" : ""}>
                              <span className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${CHANNEL_CHIP[t.step_channel] ?? CHANNEL_CHIP.Other}`}>{t.step_channel}</span>
                              <span className="font-medium text-zinc-800">
                                Day {t.step_day}: {t.step_title}
                              </span>
                              <br />
                              <span className="text-zinc-500">
                                {t.status === "pending"
                                  ? `Due ${formatDate(t.due_date)}`
                                  : `${t.status === "done" ? "Done" : t.status === "skipped" ? "Skipped" : "Cancelled"}${t.completed_by_name ? ` by ${t.completed_by_name}` : ""}${t.notes ? `: ${t.notes}` : ""}`}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </details>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {e.status !== "active" ? (
                        <span className="text-zinc-400">—</span>
                      ) : e.next_title && due ? (
                        <>
                          <p className="max-w-[12rem] truncate font-medium text-zinc-800">{e.next_title}</p>
                          {onHold ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">On hold</span>
                          ) : (
                            <span className={`rounded-full px-2 py-0.5 font-medium ${DUE_TONE[due.tone]}`}>{due.text}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{e.fit_label ? <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${FIT_CHIP[e.fit_label]}`}>{FIT_TEXT[e.fit_label]}</span> : <span className="text-zinc-400">—</span>}</td>
                    <td className="px-3 py-3 text-xs">
                      <span
                        className={`rounded-full px-2.5 py-1 font-medium ${
                          onHold ? "bg-amber-100 text-amber-800" : e.status === "active" ? "bg-emerald-100 text-emerald-800" : e.status === "completed" ? "bg-sky-100 text-sky-800" : "bg-zinc-200 text-zinc-600"
                        }`}
                      >
                        {onHold ? "On hold" : e.status === "active" ? "Running" : e.status === "completed" ? "Completed" : "Stopped"}
                      </span>
                      {e.status === "stopped" && e.stop_note && <p className="mt-1 max-w-[10rem] text-zinc-500">{e.stop_note}</p>}
                    </td>
                    <td className="px-5 py-3 text-right">{e.status === "active" && <StopEnrollment enrollmentId={e.id} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>
            Page {page} of {pages} ({list.total.toLocaleString()} enrollments)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={qs({ page: String(page - 1) })} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                Previous
              </Link>
            )}
            {page < pages && (
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

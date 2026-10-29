import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchCampaignList, fetchPlaybooks, fetchTasks, fetchTaskSummary, type TaskScope, type TaskTab } from "@/lib/campaigns";
import { CHANNEL_CHIP, DUE_TONE, dueInfo, formatDate, todayUtc } from "@/lib/campaigns-format";
import { timeAgo } from "@/lib/time-ago";
import { TaskActions } from "./task-actions";
import { TaskEmail } from "./task-email";
import { fetchMailAddress } from "@/lib/mail/account";
import { CampaignFilter } from "./campaign-filter";
import { PlaybookPanel } from "../campaigns/playbook-panel";

export const dynamic = "force-dynamic";

const TABS: { key: TaskTab; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "paused", label: "Paused" },
  { key: "done", label: "Done" },
];
const TAB_TONE: Record<TaskTab, string> = { overdue: "bg-red-100 text-red-800", today: "bg-amber-100 text-amber-800", upcoming: "bg-sky-100 text-sky-800", paused: "bg-amber-100 text-amber-800", done: "bg-zinc-100 text-zinc-600" };

type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, key: string) => {
  const v = raw[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

export default async function TasksPage({ searchParams }: { searchParams: Promise<Raw> }) {
  const raw = await searchParams;
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");

  const isAdmin = actor.role === "super_admin";
  const isLead = actor.role === "team_lead" && actor.team_id !== null;
  const manager = isAdmin || isLead;

  // "mine" for everyone; a lead can also look at their team, an admin at everyone.
  const wanted = one(raw, "scope");
  const scope: TaskScope = wanted === "all" && isAdmin ? "all" : wanted === "team" && isLead ? "team" : "mine";
  const userId = /^\d+$/.test(one(raw, "user")) && scope !== "mine" ? Number(one(raw, "user")) : null;
  const campaignId = /^\d+$/.test(one(raw, "campaign")) ? Number(one(raw, "campaign")) : null;
  const explicitTab = TABS.find((t) => t.key === one(raw, "tab"))?.key ?? null;
  const today = todayUtc();

  const [campaigns, summary] = await Promise.all([fetchCampaignList(actor), manager ? fetchTaskSummary(actor) : Promise.resolve([])]);
  const first = await fetchTasks({ actor, scope, tab: explicitTab ?? "today", userId, campaignId });
  // Opening the page with no tab chosen: show what's most urgent.
  const tab: TaskTab = explicitTab ?? (first.counts.overdue > 0 ? "overdue" : "today");
  const { rows, counts } = tab === (explicitTab ?? "today") ? first : await fetchTasks({ actor, scope, tab, userId, campaignId });

  const [playbooks, senderEmail] = await Promise.all([fetchPlaybooks(rows.map((r) => r.campaign_id)), fetchMailAddress(actor.id)]);

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { scope: scope === "mine" ? "" : scope, user: userId ? String(userId) : "", campaign: campaignId ? String(campaignId) : "", tab };
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v);
    return `/tasks?${p.toString()}`;
  };
  const viewingName = userId ? summary.find((s) => String(s.id) === String(userId))?.name : null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{scope === "mine" ? "My tasks" : scope === "team" ? "Team tasks" : "All tasks"}</h1>
          <p className="text-sm text-zinc-500">
            {viewingName ? `Showing ${viewingName}'s tasks. ` : ""}Each task is a step of a campaign. Do it, then tick it off.
          </p>
        </div>
        {manager && (
          <div className="flex gap-2">
            <Link href={qs({ scope: "", user: "" })} className={`rounded-full px-3 py-1.5 text-sm font-medium ${scope === "mine" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"}`}>
              My tasks
            </Link>
            <Link href={qs({ scope: isAdmin ? "all" : "team", user: "" })} className={`rounded-full px-3 py-1.5 text-sm font-medium ${scope !== "mine" ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"}`}>
              {isAdmin ? "Everyone" : "My team"}
            </Link>
          </div>
        )}
      </div>

      {manager && (
        <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="px-5 pt-4">
            <h2 className="text-sm font-semibold text-zinc-900">{isAdmin ? "Everyone" : "Your team"}</h2>
            <p className="text-xs text-zinc-500">Tasks due today and overdue, and what each person completed in the last 7 days. Click a name to see their tasks.</p>
          </div>
          {summary.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500">No people to show yet.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-zinc-400">
                  <th className="px-5 py-2">Person</th>
                  <th className="px-3 py-2 text-right">Due today</th>
                  <th className="px-3 py-2 text-right">Overdue</th>
                  <th className="px-5 py-2 text-right">Done this week</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {summary.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/70">
                    <td className="px-5 py-2.5">
                      <Link href={qs({ scope: isAdmin ? "all" : "team", user: p.id, tab: p.overdue ? "overdue" : "today" })} className="font-medium text-sky-700 hover:underline">
                        {p.name}
                      </Link>
                      {p.team_name && <span className="ml-2 text-xs text-zinc-400">{p.team_name}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.due_today}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${p.overdue ? "font-semibold text-red-700" : ""}`}>{p.overdue}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{p.done_week}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={qs({ tab: t.key })}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === t.key ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}
            >
              {t.label}
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tab === t.key ? "bg-white/20 text-white" : counts[t.key] ? TAB_TONE[t.key] : "bg-zinc-100 text-zinc-400"}`}>{counts[t.key]}</span>
            </Link>
          ))}
        </div>
        <CampaignFilter campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <p className="font-medium text-zinc-800">
            {tab === "done" ? "Nothing completed yet" : tab === "paused" ? "Nothing on hold" : tab === "overdue" ? "Nothing overdue. Nice." : tab === "today" ? "Nothing due today" : "Nothing coming up"}
          </p>
          <p className="mt-1 text-sm text-zinc-500">Tasks appear here when a company you own is enrolled in a campaign.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => {
            const due = dueInfo(t.due_date, today);
            const mayAct = isAdmin || (t.owner_id !== null && String(t.owner_id) === String(actor.id)) || isLead;
            const actable = mayAct && t.enrollment_status !== "stopped" && t.campaign_status !== "paused";
            // A pending email step has its Done / Skip inside the email area, next to Send.
            const actionsInEmail = Boolean(t.mail) && t.status === "pending" && actable;
            return (
              <li key={t.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {t.status === "pending" && t.campaign_status === "paused" ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">Paused</span>
                      ) : t.status === "pending" ? (
                        <span className={`rounded-full px-2.5 py-1 font-medium ${DUE_TONE[due.tone]}`}>{due.text}</span>
                      ) : (
                        <span className={`rounded-full px-2.5 py-1 font-medium ${t.status === "done" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-600"}`}>
                          {t.status === "done" ? "Done" : "Skipped"}
                        </span>
                      )}
                      <span className="text-zinc-500">{formatDate(t.due_date)}</span>
                      <span className={`rounded-full px-2.5 py-1 font-medium ${CHANNEL_CHIP[t.step_channel] ?? CHANNEL_CHIP.Other}`}>{t.step_channel}</span>
                      <span className="text-zinc-400">Day {t.step_day}</span>
                    </div>
                    <h3 className="text-base font-semibold text-zinc-900">{t.step_title}</h3>
                    <p className="text-sm text-zinc-600">
                      <Link href={`/companies/${t.company_id}`} className="font-medium text-sky-700 hover:underline">
                        {t.company_name}
                      </Link>
                      <span className="text-zinc-400"> · </span>
                      {t.recipient_label}
                      <span className="text-zinc-400"> · </span>
                      <span className="text-zinc-500">{t.campaign_name}</span>
                      {scope !== "mine" && (
                        <>
                          <span className="text-zinc-400"> · </span>
                          <span className="text-zinc-500">{t.owner_name ? `Owner: ${t.owner_name}` : "No owner"}</span>
                        </>
                      )}
                    </p>
                    {t.step_instructions && (
                      <details className="group text-sm text-zinc-600">
                        <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800">Instructions</summary>
                        <p className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 leading-relaxed">{t.step_instructions}</p>
                      </details>
                    )}
                    <PlaybookPanel playbook={playbooks[t.campaign_id]} />
                    {t.mail && <TaskEmail taskId={t.id} status={t.status} channel={t.step_channel} canAct={actable} mail={t.mail} senderName={actor.name} senderEmail={senderEmail} />}
                    {t.status !== "pending" && (
                      <p className="text-xs text-zinc-500">
                        {t.status === "done" ? "Done" : "Skipped"} by {t.completed_by_name ?? "someone"} {t.completed_at ? timeAgo(t.completed_at) : ""}
                        {t.notes ? `: ${t.notes}` : ""}
                      </p>
                    )}
                  </div>
                  {!actionsInEmail && <TaskActions taskId={t.id} status={t.status} channel={t.step_channel} canAct={actable} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

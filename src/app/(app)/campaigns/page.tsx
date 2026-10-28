import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchCampaignList } from "@/lib/campaigns";
import { CAMPAIGN_STATUS_CHIP, CAMPAIGN_STATUS_LABEL, VISIBILITY_CHIP, VISIBILITY_LABEL } from "@/lib/campaigns-format";
import { timeAgo } from "@/lib/time-ago";
import { CampaignStatusActions } from "./status-actions";
import { DuplicateButton } from "./duplicate-button";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const campaigns = await fetchCampaignList(user);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Campaigns</h1>
          <p className="text-sm text-zinc-500">
            A campaign is a set of steps and a playbook. When a verified company is enrolled, each step becomes a task for its owner. You see your own campaigns, your team&apos;s, and public ones.
          </p>
        </div>
        <Link href="/campaigns/new" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800">
          New campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <p className="font-medium text-zinc-800">No campaigns yet</p>
          <p className="mt-1 text-sm text-zinc-500">Create one, with a playbook and steps like &ldquo;Day 1 email&rdquo; and &ldquo;Day 3 follow-up&rdquo;.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3">Campaign</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Visible to</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3 text-right">Steps</th>
                <th className="px-3 py-3 text-right">Running</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {campaigns.map((c) => (
                <tr key={c.id} className="align-top hover:bg-zinc-50/70">
                  <td className="max-w-md px-5 py-4">
                    <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] text-zinc-600">{c.code}</span>
                    <Link href={`/campaigns/${c.id}`} className="font-semibold text-sky-700 hover:underline">
                      {c.name}
                    </Link>
                    {c.description && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{c.description}</p>}
                  </td>
                  <td className="px-3 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${CAMPAIGN_STATUS_CHIP[c.status]}`}>{CAMPAIGN_STATUS_LABEL[c.status]}</span>
                  </td>
                  <td className="px-3 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${VISIBILITY_CHIP[c.visibility]}`}>
                      {VISIBILITY_LABEL[c.visibility]}
                      {c.visibility === "team" && c.team_name ? `: ${c.team_name}` : ""}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-zinc-600">{c.owner_name ?? "—"}</td>
                  <td className="px-3 py-4 text-right tabular-nums text-zinc-700">{c.step_count}</td>
                  <td className="px-3 py-4 text-right tabular-nums text-zinc-700">{c.active_enrollments}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-zinc-500">{timeAgo(c.created_at)}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex justify-end gap-2">
                        <Link href={`/campaigns/${c.id}`} className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                          {c.can_manage && c.status !== "completed" ? "Edit" : "View"}
                        </Link>
                        <DuplicateButton id={c.id} />
                      </div>
                      {c.can_manage && <CampaignStatusActions id={c.id} status={c.status} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

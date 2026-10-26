import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchCampaignList } from "@/lib/campaigns";
import { timeAgo } from "@/lib/time-ago";
import { CampaignStatusButton } from "./status-button";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const campaigns = await fetchCampaignList();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Campaigns</h1>
          <p className="text-sm text-zinc-500">
            A campaign is a set of steps. When a company that is Ready for Outreach is enrolled, each step becomes a task for its owner.
          </p>
        </div>
        <Link href="/campaigns/new" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800">
          New campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
          <p className="font-medium text-zinc-800">No campaigns yet</p>
          <p className="mt-1 text-sm text-zinc-500">Create one, with a description and steps like &ldquo;Day 1 email&rdquo; and &ldquo;Day 3 follow-up&rdquo;.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <th className="px-5 py-3">Campaign</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Steps</th>
                <th className="px-3 py-3 text-right">Running</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {campaigns.map((c) => (
                <tr key={c.id} className="align-top hover:bg-zinc-50/70">
                  <td className="max-w-lg px-5 py-4">
                    <Link href={`/campaigns/${c.id}`} className="font-semibold text-sky-700 hover:underline">
                      {c.name}
                    </Link>
                    {c.description && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{c.description}</p>}
                  </td>
                  <td className="px-3 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-600"}`}>
                      {c.status === "active" ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums text-zinc-700">{c.step_count}</td>
                  <td className="px-3 py-4 text-right tabular-nums text-zinc-700">{c.active_enrollments}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-zinc-500">{timeAgo(c.created_at)}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/campaigns/${c.id}`} className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                        Edit
                      </Link>
                      <CampaignStatusButton id={c.id} status={c.status} activeEnrollments={c.active_enrollments} />
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

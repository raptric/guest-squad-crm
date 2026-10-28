import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchCampaign } from "@/lib/campaigns";
import { fetchFitList } from "@/lib/campaign-fit";
import { audienceSummary, FIT_CHIP, FIT_TEXT, type FitLabel } from "@/lib/campaign-fit-format";
import { CampaignTabs } from "../../campaign-tabs";

export const dynamic = "force-dynamic";

const SIZE = 25;
type Raw = Record<string, string | string[] | undefined>;
const one = (raw: Raw, key: string) => {
  const v = raw[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

// "Companies that fit": the companies this person can see that match the campaign's target audience, best fit first.
export default async function CampaignFitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Raw> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const campaign = await fetchCampaign(id, user);
  if (!campaign) notFound();

  const raw = await searchParams;
  const label = (["strong", "partial", "weak"] as const).find((l) => l === one(raw, "fit")) ?? null;
  const includeUnverified = one(raw, "all") === "1";
  const page = Math.max(1, parseInt(one(raw, "page"), 10) || 1);
  const list = await fetchFitList(user, Number(id), { includeUnverified, label, page, size: SIZE });

  const qs = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { fit: label ?? "", all: includeUnverified ? "1" : "", page: String(page) };
    for (const [k, v] of Object.entries({ ...base, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return `/campaigns/${id}/fit${s ? `?${s}` : ""}`;
  };
  const pages = Math.max(1, Math.ceil(list.total / SIZE));
  const open = campaign.status === "active";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-8">
      <div>
        <Link href={`/campaigns/${id}`} className="text-sm text-zinc-500 hover:text-zinc-800">
          &larr; Back to {campaign.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Companies that fit</h1>
        <p className="text-sm text-zinc-500">
          <span className="font-mono text-xs">{campaign.code}</span> · {campaign.name}
          {audienceSummary(campaign.criteria) ? ` · ${audienceSummary(campaign.criteria)}` : ""}
        </p>
      </div>

      <CampaignTabs id={id} active="fit" />

      {!list.hasCriteria ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
          <p className="font-medium text-zinc-800">This campaign has no target audience yet</p>
          <p className="mt-1 text-sm text-zinc-500">Set at least one criterion (company type, property type, rooms, portfolio or location) to see which companies fit.</p>
        </div>
      ) : (
        <>
          {!open && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">This campaign is {campaign.status}, so companies can&apos;t be enrolled in it right now.</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Link href={qs({ fit: undefined, page: undefined })} className={`rounded-xl px-4 py-2 text-sm font-medium ${!label ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
                All <span className="ml-1 opacity-70">{list.counts.total.toLocaleString()}</span>
              </Link>
              {(["strong", "partial", "weak"] as FitLabel[]).map((l) => (
                <Link key={l} href={qs({ fit: l, page: undefined })} className={`rounded-xl px-4 py-2 text-sm font-medium ${label === l ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
                  {FIT_TEXT[l]} <span className="ml-1 opacity-70">{list.counts[l].toLocaleString()}</span>
                </Link>
              ))}
            </div>
            <Link href={qs({ all: includeUnverified ? undefined : "1", page: undefined })} className="text-sm text-sky-700 hover:underline">
              {includeUnverified ? "Show only companies ready to enroll" : "Also show companies not ready to enroll yet"}
            </Link>
          </div>

          {list.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
              <p className="font-medium text-zinc-800">No companies to show</p>
              <p className="mt-1 text-sm text-zinc-500">Companies already in an active campaign are left out. {includeUnverified ? "" : "Try including the ones not ready to enroll yet."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                    <th className="px-5 py-3">Company</th>
                    <th className="px-3 py-3">Location</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3 text-right">Rooms</th>
                    <th className="px-3 py-3">Fit</th>
                    <th className="px-3 py-3">Owner</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {list.rows.map((r) => {
                    const mine = r.owner_id !== null && String(r.owner_id) === String(user.id);
                    return (
                      <tr key={r.id} className="hover:bg-zinc-50/70">
                        <td className="px-5 py-3">
                          <Link href={`/companies/${r.id}`} className="font-medium text-sky-700 hover:underline">
                            {r.name}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-zinc-600">{[r.city, r.state, r.country].filter(Boolean).join(", ") || "—"}</td>
                        <td className="px-3 py-3 text-zinc-600">{r.property_type ?? r.company_type}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-zinc-600">{r.rooms_units ?? "—"}</td>
                        <td className="px-3 py-3">
                          {r.fit && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${FIT_CHIP[r.fit]}`}>{FIT_TEXT[r.fit]}</span>}
                          {r.unknowns > 0 && <span className="ml-2 text-xs text-zinc-500">{r.unknowns} not recorded</span>}
                        </td>
                        <td className="px-3 py-3 text-zinc-600">{r.owner_name ?? "Unassigned"}</td>
                        <td className="px-5 py-3 text-right text-xs">
                          {!r.enrollable ? (
                            <span className="text-zinc-400">{r.verified ? "Stage not allowed" : "Not verified yet"}</span>
                          ) : mine && open ? (
                            <Link href={`/companies/${r.id}`} className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-800">
                              Enroll
                            </Link>
                          ) : (
                            <span className="text-zinc-400">{r.owner_id ? "Owner enrolls" : "No owner yet"}</span>
                          )}
                        </td>
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
                Page {page} of {pages} ({list.total.toLocaleString()} companies)
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
        </>
      )}
    </div>
  );
}

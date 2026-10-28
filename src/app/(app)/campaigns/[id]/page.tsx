import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchCampaign } from "@/lib/campaigns";
import { loadCampaignFormData } from "@/lib/campaign-form-data";
import { CAMPAIGN_STATUS_CHIP, CAMPAIGN_STATUS_LABEL, CHANNEL_CHIP, VISIBILITY_LABEL } from "@/lib/campaigns-format";
import { CampaignForm } from "../campaign-form";
import { CampaignStatusActions } from "../status-actions";
import { DuplicateButton } from "../duplicate-button";
import { PlaybookPanel } from "../playbook-panel";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  // A campaign outside your view looks like one that doesn't exist.
  const campaign = await fetchCampaign(id, user);
  if (!campaign) notFound();

  const editable = campaign.can_manage && campaign.status !== "completed";
  const data = editable ? await loadCampaignFormData(user) : null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/campaigns" className="text-sm text-zinc-500 hover:text-zinc-800">
            &larr; Back to Campaigns
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            {campaign.name}
            <span className={`ml-3 rounded-full px-2.5 py-1 align-middle text-xs font-medium ${CAMPAIGN_STATUS_CHIP[campaign.status]}`}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            <span className="font-mono text-xs">{campaign.code}</span> · {VISIBILITY_LABEL[campaign.visibility]}
            {campaign.visibility === "team" && campaign.team_name ? ` (${campaign.team_name})` : ""} · Owner: {campaign.owner_name ?? "none"}
            {campaign.copied_from_code ? ` · Copied from ${campaign.copied_from_code}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <DuplicateButton id={campaign.id} />
          {campaign.can_manage && <CampaignStatusActions id={campaign.id} status={campaign.status} />}
        </div>
      </div>

      {campaign.status === "completed" && campaign.running > 0 && (
        <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Completed · {campaign.running} {campaign.running === 1 ? "company is" : "companies are"} still running it. No new companies can join.
        </p>
      )}
      {campaign.status === "paused" && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Paused: its tasks are held and show as Paused. When you resume, their due dates move forward by the days it was paused.</p>
      )}

      {editable && data ? (
        <CampaignForm
          initial={{
            id: campaign.id,
            code: campaign.code,
            name: campaign.name,
            description: campaign.description,
            status: campaign.status,
            visibility: campaign.visibility,
            team_id: campaign.team_id,
            owner_id: campaign.owner_id,
            steps: campaign.steps,
            outreach_angle: campaign.playbook.outreach_angle,
            pain_point: campaign.playbook.pain_point,
            secondary_pains: campaign.playbook.secondary_pains,
            positioning: campaign.playbook.positioning,
            differentiators: campaign.playbook.differentiators,
            objections: campaign.playbook.objections,
          }}
          lists={data.lists}
          viewer={data.viewer}
          teams={data.teams}
          users={data.users}
        />
      ) : (
        <div className="space-y-6">
          {campaign.description && (
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-base font-semibold text-zinc-900">Description</h2>
              <p className="whitespace-pre-wrap text-sm text-zinc-700">{campaign.description}</p>
            </section>
          )}
          <PlaybookPanel playbook={campaign.playbook} defaultOpen />
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-3 text-base font-semibold text-zinc-900">Steps</h2>
            <ol className="space-y-3">
              {campaign.steps.map((s, i) => (
                <li key={i} className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium text-zinc-500">Day {s.day_number}</span>
                    <span className={`rounded-full px-2 py-0.5 font-medium ${CHANNEL_CHIP[s.channel] ?? CHANNEL_CHIP.Other}`}>{s.channel}</span>
                  </div>
                  <p className="mt-1 font-medium text-zinc-900">{s.title}</p>
                  {s.instructions && <p className="mt-1 whitespace-pre-wrap text-zinc-600">{s.instructions}</p>}
                </li>
              ))}
            </ol>
          </section>
          {!campaign.can_manage && <p className="text-xs text-zinc-500">This campaign belongs to {campaign.owner_name ?? "someone else"}. Duplicate it to make your own version.</p>}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchCampaign } from "@/lib/campaigns";
import { CampaignForm } from "../campaign-form";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const campaign = await fetchCampaign(id);
  if (!campaign) notFound();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6 lg:p-8">
      <div>
        <Link href="/campaigns" className="text-sm text-zinc-500 hover:text-zinc-800">
          &larr; Back to Campaigns
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
          {campaign.name}
          {campaign.status === "archived" && <span className="ml-3 rounded-full bg-zinc-200 px-2.5 py-1 align-middle text-xs font-medium text-zinc-600">Archived</span>}
        </h1>
      </div>
      <CampaignForm initial={{ id: campaign.id, name: campaign.name, description: campaign.description, steps: campaign.steps }} />
    </div>
  );
}

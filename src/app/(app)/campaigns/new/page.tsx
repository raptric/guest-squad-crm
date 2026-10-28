import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { loadCampaignFormData } from "@/lib/campaign-form-data";
import { CampaignForm } from "../campaign-form";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const data = await loadCampaignFormData(user);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-8">
      <div>
        <Link href="/campaigns" className="text-sm text-zinc-500 hover:text-zinc-800">
          &larr; Back to Campaigns
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">New campaign</h1>
      </div>
      <CampaignForm lists={data.lists} viewer={data.viewer} teams={data.teams} users={data.users} />
    </div>
  );
}

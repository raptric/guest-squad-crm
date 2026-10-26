import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { CampaignForm } from "../campaign-form";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6 lg:p-8">
      <div>
        <Link href="/campaigns" className="text-sm text-zinc-500 hover:text-zinc-800">
          &larr; Back to Campaigns
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">New campaign</h1>
      </div>
      <CampaignForm />
    </div>
  );
}

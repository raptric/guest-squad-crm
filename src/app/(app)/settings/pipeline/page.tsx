import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchPipeline } from "@/lib/pipeline";
import { PipelineSettings } from "../pipeline-settings";
import { SettingsHeader } from "../settings-header";

export const dynamic = "force-dynamic";

export default async function PipelineSettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const pipeline = await fetchPipeline({ all: true, counts: true });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <SettingsHeader title="Pipeline" description="The statuses and stages a company moves through." />
      <PipelineSettings statuses={pipeline} />
    </div>
  );
}

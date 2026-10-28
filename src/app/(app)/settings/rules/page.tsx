import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { fetchPipeline, fetchScraperRule, fetchVerifiedRule } from "@/lib/pipeline";
import { fetchEnrollmentRule } from "@/lib/campaign-rule";
import { RulesSettings } from "../rules-settings";
import { SettingsHeader } from "../settings-header";

export const dynamic = "force-dynamic";

export default async function RulesSettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const [pipeline, verifiedRule, enrollmentRule, scraperRule] = await Promise.all([
    fetchPipeline({ all: true, counts: true }),
    fetchVerifiedRule(),
    fetchEnrollmentRule(),
    fetchScraperRule(),
  ]);
  const supabase = await createClient();
  const { data } = await supabase.from("picklist_values").select("value").eq("field_name", "property_type").eq("is_active", true).order("sort_order");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <SettingsHeader title="Rules" description="When a company counts as verified, who can be enrolled in a campaign, and what the scraper may bring in." />
      {verifiedRule && (
        <RulesSettings statuses={pipeline} rule={verifiedRule} enrollmentRule={enrollmentRule} scraperRule={scraperRule} propertyTypes={data?.map((v) => v.value) ?? []} />
      )}
    </div>
  );
}

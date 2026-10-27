import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { PicklistSection } from "./picklist-section";
import { McpConnection } from "./mcp-connection";
import { PipelineSettings } from "./pipeline-settings";
import { fetchPipeline, fetchScraperRule, fetchVerifiedRule } from "@/lib/pipeline";
import { RulesSettings } from "./rules-settings";
import { fetchEnrollmentRule } from "@/lib/campaign-rule";

export const dynamic = "force-dynamic";

const LEGACY_FIELDS: { title: string; fieldName: string }[] = [
  { title: "Lead Status (old)", fieldName: "lead_status" },
  { title: "Lifecycle Stage (old)", fieldName: "lifecycle_stage" },
];

const FIELDS: { title: string; fieldName: string }[] = [
  { title: "Company Type", fieldName: "company_type" },
  { title: "Property Type", fieldName: "property_type" },
  { title: "Property Class", fieldName: "property_class" },
  { title: "Portfolio Role", fieldName: "portfolio_role" },
  { title: "Prospect Tier", fieldName: "prospect_tier" },
  { title: "Hiring Signal Role", fieldName: "hiring_signal_role" },
  { title: "Signal Strength", fieldName: "strength" },
  { title: "Offer Service", fieldName: "offer_service" },
  { title: "Contact Role", fieldName: "contact_role" },
  { title: "Decision Maker Level", fieldName: "decision_maker_level" },
  { title: "Contact Line Type", fieldName: "contact_line_type" },
  { title: "Email Label", fieldName: "email_label" },
  { title: "Phone Label", fieldName: "phone_label" },
  { title: "Country", fieldName: "country" },
];

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const [pipeline, verifiedRule, enrollmentRule, scraperRule] = await Promise.all([
    fetchPipeline({ all: true, counts: true }),
    fetchVerifiedRule(),
    fetchEnrollmentRule(),
    fetchScraperRule(),
  ]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("picklist_values")
    .select("id, field_name, value")
    .eq("is_active", true)
    .order("sort_order");

  // NEXT_PUBLIC_APP_URL is this app's own source of truth for its URL (also used for auth
  // redirect links); fall back to the request's own host if it isn't set.
  const requestHeaders = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;
  const mcpUrl = `${origin.replace(/\/$/, "")}/api/mcp`;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500">Manage dropdown values used across Companies.</p>
      </div>

      <PipelineSettings statuses={pipeline} />

      {verifiedRule && (
        <RulesSettings
          statuses={pipeline}
          rule={verifiedRule}
          enrollmentRule={enrollmentRule}
          scraperRule={scraperRule}
          propertyTypes={data?.filter((v) => v.field_name === "property_type").map((v) => v.value) ?? []}
        />
      )}

      <McpConnection mcpUrl={mcpUrl} apiKey={process.env.MCP_API_KEY ?? null} />

      {FIELDS.map(({ title, fieldName }) => (
        <PicklistSection
          key={fieldName}
          title={title}
          fieldName={fieldName}
          values={data?.filter((v) => v.field_name === fieldName) ?? []}
        />
      ))}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Old fields (kept for now)</h2>
          <p className="text-xs text-zinc-500">
            The research agent, the scraper and the Review Queue still use these two lists. They are replaced by Statuses &amp; stages above once the MCP is updated.
          </p>
        </div>
        {LEGACY_FIELDS.map(({ title, fieldName }) => (
          <PicklistSection key={fieldName} title={title} fieldName={fieldName} values={data?.filter((v) => v.field_name === fieldName) ?? []} />
        ))}
      </section>
    </div>
  );
}

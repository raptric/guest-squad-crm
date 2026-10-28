import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { PicklistSection } from "../picklist-section";
import { SettingsHeader } from "../settings-header";

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
  { title: "Campaign Outreach Angle", fieldName: "outreach_angle" },
  { title: "Campaign Key Differentiator", fieldName: "key_differentiator" },
  { title: "Contact Role", fieldName: "contact_role" },
  { title: "Decision Maker Level", fieldName: "decision_maker_level" },
  { title: "Contact Line Type", fieldName: "contact_line_type" },
  { title: "Email Label", fieldName: "email_label" },
  { title: "Phone Label", fieldName: "phone_label" },
  { title: "Country", fieldName: "country" },
];

export default async function ListsSettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const supabase = await createClient();
  const { data } = await supabase.from("picklist_values").select("id, field_name, value").eq("is_active", true).order("sort_order");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <SettingsHeader title="Lists" description="The dropdown values used across Companies, Contacts and Campaigns." />

      {FIELDS.map(({ title, fieldName }) => (
        <PicklistSection key={fieldName} title={title} fieldName={fieldName} values={data?.filter((v) => v.field_name === fieldName) ?? []} />
      ))}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Old fields (kept for now)</h2>
          <p className="text-xs text-zinc-500">
            The research agent, the scraper and the Review Queue still use these two lists. They are replaced by Statuses &amp; stages in Pipeline once the MCP is updated.
          </p>
        </div>
        {LEGACY_FIELDS.map(({ title, fieldName }) => (
          <PicklistSection key={fieldName} title={title} fieldName={fieldName} values={data?.filter((v) => v.field_name === fieldName) ?? []} />
        ))}
      </section>
    </div>
  );
}

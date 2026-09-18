import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { PicklistSection } from "./picklist-section";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const supabase = await createClient();
  const { data } = await supabase
    .from("picklist_values")
    .select("id, field_name, value")
    .eq("is_active", true)
    .order("sort_order");

  const leadStatuses = data?.filter((v) => v.field_name === "lead_status") ?? [];
  const lifecycleStages = data?.filter((v) => v.field_name === "lifecycle_stage") ?? [];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500">Manage dropdown values used across Companies.</p>
      </div>

      <PicklistSection title="Lead Status" fieldName="lead_status" values={leadStatuses} />
      <PicklistSection title="Lifecycle Stage" fieldName="lifecycle_stage" values={lifecycleStages} />
    </div>
  );
}

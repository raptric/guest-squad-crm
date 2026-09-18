import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPicklistValues } from "@/lib/picklists";
import { CompanyForm } from "../company-form";

export default async function NewCompanyPage() {
  const supabase = await createClient();
  const [{ data: users }, lifecycleStages, leadStatuses] = await Promise.all([
    supabase.from("users").select("id, name").order("name"),
    getPicklistValues("lifecycle_stage"),
    getPicklistValues("lead_status"),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">New Company</h1>
        <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-700">
          Back to Companies
        </Link>
      </div>

      <CompanyForm users={users ?? []} lifecycleStages={lifecycleStages} leadStatuses={leadStatuses} />
    </div>
  );
}

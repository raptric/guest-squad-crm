import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPicklistValues } from "@/lib/picklists";
import { getCurrentUser } from "@/lib/current-user";
import { assignableUsers, canAssign } from "@/lib/assignment";
import { CompanyForm } from "../company-form";

export default async function NewCompanyPage() {
  const supabase = await createClient();
  const [
    { actor, users },
    companyTypes,
    propertyTypes,
    propertyClasses,
    portfolioRoles,
    prospectTiers,
    countries,
  ] = await Promise.all([
    getCurrentUser().then(async (actor) => ({ actor, users: actor && canAssign(actor) ? await assignableUsers(actor) : [] })),
    getPicklistValues("company_type"),
    getPicklistValues("property_type"),
    getPicklistValues("property_class"),
    getPicklistValues("portfolio_role"),
    getPicklistValues("prospect_tier"),
    getPicklistValues("country"),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">New Company</h1>
        <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-700">
          Back to Companies
        </Link>
      </div>

      <CompanyForm
        users={users}
        canAssign={canAssign(actor)}
        companyTypes={companyTypes}
        propertyTypes={propertyTypes}
        propertyClasses={propertyClasses}
        portfolioRoles={portfolioRoles}
        prospectTiers={prospectTiers}
        countries={countries}
      />
    </div>
  );
}

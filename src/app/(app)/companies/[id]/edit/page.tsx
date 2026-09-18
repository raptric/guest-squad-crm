import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPicklistValues } from "@/lib/picklists";
import { CompanyForm, type CompanyInitialValues } from "../../company-form";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: company },
    { data: users },
    lifecycleStages,
    leadStatuses,
    companyTypes,
    propertyTypes,
    propertyClasses,
    portfolioRoles,
    prospectTiers,
  ] = await Promise.all([
    supabase
      .from("companies")
      .select(
        `id, name, website, company_type, address_line_1, address_line_2, city, state, country, zip, phone,
         lifecycle_stage, lead_status, prospect_tier, qualification_summary, sdr_signal_summary,
         owner_id, portfolio_size,
         parent_company:parent_company_id ( id, name, company_type )`
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase.from("users").select("id, name").order("name"),
    getPicklistValues("lifecycle_stage"),
    getPicklistValues("lead_status"),
    getPicklistValues("company_type"),
    getPicklistValues("property_type"),
    getPicklistValues("property_class"),
    getPicklistValues("portfolio_role"),
    getPicklistValues("prospect_tier"),
  ]);

  if (!company) notFound();

  // If this record still has a legacy value no longer in the active picklist, keep it
  // selectable (as its current value) instead of silently switching the dropdown to the
  // first active option.
  const lifecycleStageOptions = lifecycleStages.includes(company.lifecycle_stage)
    ? lifecycleStages
    : [company.lifecycle_stage, ...lifecycleStages];
  const leadStatusOptions = leadStatuses.includes(company.lead_status)
    ? leadStatuses
    : [company.lead_status, ...leadStatuses];

  const { data: propertyDetails } =
    company.company_type === "Property"
      ? await supabase
          .from("property_details")
          .select("property_type, property_class, rooms_units, portfolio_role")
          .eq("company_id", id)
          .single()
      : { data: null };

  const initialValues: CompanyInitialValues = {
    name: company.name,
    website: company.website,
    company_type: company.company_type,
    parent: company.parent_company as unknown as CompanyInitialValues["parent"],
    address_line_1: company.address_line_1,
    address_line_2: company.address_line_2,
    city: company.city,
    state: company.state,
    country: company.country,
    zip: company.zip,
    phone: company.phone,
    lifecycle_stage: company.lifecycle_stage,
    lead_status: company.lead_status,
    prospect_tier: company.prospect_tier,
    qualification_summary: company.qualification_summary,
    sdr_signal_summary: company.sdr_signal_summary,
    owner_id: company.owner_id,
    portfolio_size: company.portfolio_size,
    property_type: propertyDetails?.property_type ?? null,
    property_class: propertyDetails?.property_class ?? null,
    rooms_units: propertyDetails?.rooms_units ?? null,
    portfolio_role: propertyDetails?.portfolio_role ?? null,
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Edit {company.name}</h1>
        <Link href={`/companies/${id}`} className="text-sm text-zinc-500 hover:text-zinc-700">
          Back to {company.name}
        </Link>
      </div>

      <CompanyForm
        users={users ?? []}
        lifecycleStages={lifecycleStageOptions}
        leadStatuses={leadStatusOptions}
        companyTypes={companyTypes}
        propertyTypes={propertyTypes}
        propertyClasses={propertyClasses}
        portfolioRoles={portfolioRoles}
        prospectTiers={prospectTiers}
        initialValues={initialValues}
        companyId={Number(id)}
      />
    </div>
  );
}

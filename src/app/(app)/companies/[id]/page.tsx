import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, name, website, company_type, city, country, address_line_1, phone, lifecycle_stage, lead_status, prospect_tier, qualification_summary, sdr_signal_summary"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!company) notFound();

  const { data: propertyDetails } =
    company.company_type === "Property"
      ? await supabase
          .from("property_details")
          .select("property_type, property_class, rooms_units, portfolio_role, portfolio_size")
          .eq("company_id", id)
          .single()
      : { data: null };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-8">
      <div>
        <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-700">
          Back to Companies
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-900">{company.name}</h1>
        <div className="mt-1 flex gap-2 text-xs text-zinc-500">
          <span className="rounded bg-zinc-100 px-2 py-0.5">{company.company_type}</span>
          <span className="rounded bg-zinc-100 px-2 py-0.5">{company.lifecycle_stage}</span>
          <span className="rounded bg-zinc-100 px-2 py-0.5">{company.lead_status}</span>
          {company.prospect_tier && (
            <span className="rounded bg-zinc-100 px-2 py-0.5">{company.prospect_tier}</span>
          )}
        </div>
      </div>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Overview</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-500">Website</dt>
            <dd className="text-zinc-900">{company.website ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Phone</dt>
            <dd className="text-zinc-900">{company.phone ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Address</dt>
            <dd className="text-zinc-900">{company.address_line_1 ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">City / Country</dt>
            <dd className="text-zinc-900">
              {[company.city, company.country].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
        </dl>
      </section>

      {propertyDetails && (
        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Property Profile</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-zinc-500">Property Type</dt>
              <dd className="text-zinc-900">{propertyDetails.property_type ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Class</dt>
              <dd className="text-zinc-900">{propertyDetails.property_class ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Rooms/Units</dt>
              <dd className="text-zinc-900">{propertyDetails.rooms_units ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Portfolio Role</dt>
              <dd className="text-zinc-900">{propertyDetails.portfolio_role ?? "—"}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Qualification</h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-zinc-500">Qualification Summary</dt>
            <dd className="text-zinc-900">{company.qualification_summary ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Why Now (SDR Signal Summary)</dt>
            <dd className="text-zinc-900">{company.sdr_signal_summary ?? "—"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

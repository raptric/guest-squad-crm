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
      `id, name, website, company_type, address_line_1, address_line_2, city, state, country, zip, phone,
       lifecycle_stage, lead_status, prospect_tier, qualification_summary, sdr_signal_summary, portfolio_size,
       parent_company:parent_company_id ( id, name ),
       owner:owner_id ( id, name )`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!company) notFound();

  const parentCompany = company.parent_company as unknown as { id: number; name: string } | null;
  const owner = company.owner as unknown as { id: number; name: string } | null;

  const [{ data: propertyDetails }, { data: children }] = await Promise.all([
    company.company_type === "Property"
      ? supabase
          .from("property_details")
          .select("property_type, property_class, rooms_units, portfolio_role")
          .eq("company_id", id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("companies")
      .select("id, name, company_type, city, country")
      .eq("parent_company_id", id)
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-8">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-700">
            Back to Companies
          </Link>
          <h1 className="text-2xl font-semibold text-zinc-900">{company.name}</h1>
        </div>
        <Link
          href={`/companies/${id}/edit`}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Edit
        </Link>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
        <span className="rounded bg-zinc-100 px-2 py-0.5">{company.company_type}</span>
        <span className="rounded bg-zinc-100 px-2 py-0.5">{company.lifecycle_stage}</span>
        <span className="rounded bg-zinc-100 px-2 py-0.5">{company.lead_status}</span>
        {company.prospect_tier && (
          <span className="rounded bg-zinc-100 px-2 py-0.5">{company.prospect_tier}</span>
        )}
        {parentCompany && (
          <span className="rounded bg-zinc-100 px-2 py-0.5">
            Part of{" "}
            <Link href={`/companies/${parentCompany.id}`} className="underline">
              {parentCompany.name}
            </Link>
          </span>
        )}
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
            <dd className="text-zinc-900">
              {[company.address_line_1, company.address_line_2].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">City / State</dt>
            <dd className="text-zinc-900">
              {[company.city, company.state].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Country / Zip</dt>
            <dd className="text-zinc-900">
              {[company.country, company.zip].filter(Boolean).join(", ") || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Owner</dt>
            <dd className="text-zinc-900">{owner?.name ?? "Unassigned"}</dd>
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

      {company.company_type !== "Property" && (
        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-zinc-900">
            Portfolio ({children?.length ?? 0} listed{" "}
            {company.portfolio_size ? `of ${company.portfolio_size} known` : ""})
          </h2>
          {!children?.length ? (
            <p className="text-sm text-zinc-500">No properties linked to this group yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm">
              {children.map((child) => (
                <li key={child.id} className="flex items-center justify-between py-2">
                  <Link href={`/companies/${child.id}`} className="font-medium text-zinc-900 hover:underline">
                    {child.name}
                  </Link>
                  <span className="text-zinc-500">
                    {child.company_type} · {[child.city, child.country].filter(Boolean).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
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

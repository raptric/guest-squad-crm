import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_TYPES, LIFECYCLE_STAGES, LEAD_STATUSES } from "@/lib/companies/constants";

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("companies")
    .select("id, name, city, country, company_type, lifecycle_stage, lead_status, prospect_tier")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (params.city) query = query.ilike("city", `%${params.city}%`);
  if (params.country) query = query.ilike("country", `%${params.country}%`);
  if (params.company_type) query = query.eq("company_type", params.company_type);
  if (params.lifecycle_stage) query = query.eq("lifecycle_stage", params.lifecycle_stage);
  if (params.lead_status) query = query.eq("lead_status", params.lead_status);

  const { data: companies } = await query;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Companies</h1>
          <p className="text-sm text-zinc-500">Properties, management companies, and portfolios.</p>
        </div>
        <Link
          href="/companies/new"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          New Company
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">City</label>
          <input
            name="city"
            defaultValue={params.city}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Country</label>
          <input
            name="country"
            defaultValue={params.country}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Type</label>
          <select
            name="company_type"
            defaultValue={params.company_type ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            {COMPANY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Lifecycle Stage</label>
          <select
            name="lifecycle_stage"
            defaultValue={params.lifecycle_stage ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            {LIFECYCLE_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-700">Lead Status</label>
          <select
            name="lead_status"
            defaultValue={params.lead_status ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
          >
            <option value="">All</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Filter
        </button>
        <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-700">
          Clear
        </Link>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Type</th>
            <th className="py-2 font-medium">City</th>
            <th className="py-2 font-medium">Country</th>
            <th className="py-2 font-medium">Lifecycle</th>
            <th className="py-2 font-medium">Lead Status</th>
            <th className="py-2 font-medium">Tier</th>
          </tr>
        </thead>
        <tbody>
          {companies?.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="py-2">
                <Link href={`/companies/${c.id}`} className="font-medium text-zinc-900 hover:underline">
                  {c.name}
                </Link>
              </td>
              <td className="py-2 text-zinc-600">{c.company_type}</td>
              <td className="py-2 text-zinc-600">{c.city}</td>
              <td className="py-2 text-zinc-600">{c.country}</td>
              <td className="py-2 text-zinc-600">{c.lifecycle_stage}</td>
              <td className="py-2 text-zinc-600">{c.lead_status}</td>
              <td className="py-2 text-zinc-600">{c.prospect_tier}</td>
            </tr>
          ))}
          {companies?.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-zinc-500">
                No companies yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

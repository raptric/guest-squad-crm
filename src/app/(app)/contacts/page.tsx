import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CompanyLink = { is_primary: boolean; company: { id: number; name: string } };

// Primary company first; any others are summarized as "+N" with the full list on hover.
function CompanyLinks({ links }: { links: CompanyLink[] }) {
  if (!links?.length) return <>—</>;
  const sorted = [...links].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const [first, ...others] = sorted;
  return (
    <>
      <Link href={`/companies/${first.company.id}`} className="hover:underline">
        {first.company.name}
      </Link>
      {others.length > 0 && (
        <span className="ml-1 text-xs text-zinc-500" title={others.map((o) => o.company.name).join(", ")}>
          +{others.length} more
        </span>
      )}
    </>
  );
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q } = await searchParams;
  const supabase = await createClient();

  const pageSize = 20;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, email, phone, job_title, contact_role, decision_maker_level, contact_companies ( is_primary, company:company_id ( id, name ) )",
      { count: "exact" }
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  // Strip characters that are special in PostgREST's or() filter syntax.
  const term = q?.trim().replace(/[,()%*]/g, " ");
  if (term) {
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,job_title.ilike.%${term}%`
    );
  }

  const { data: contacts, count } = await query;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const pageHref = (p: number) => `/contacts?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Contacts</h1>
          <p className="text-sm text-zinc-500">People at properties, management companies, and portfolios.</p>
        </div>
        <Link
          href="/contacts/new"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          New Contact
        </Link>
      </div>

      <form className="flex items-center gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, email, or title..."
          className="w-72 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Search
        </button>
        {q && (
          <Link href="/contacts" className="text-sm text-zinc-500 hover:text-zinc-700">
            Clear
          </Link>
        )}
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Company</th>
            <th className="py-2 pr-4 font-medium">Title</th>
            <th className="py-2 pr-4 font-medium">Role</th>
            <th className="py-2 pr-4 font-medium">Decision Maker</th>
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 font-medium">Phone</th>
          </tr>
        </thead>
        <tbody>
          {contacts?.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="py-2 pr-4">
                <Link href={`/contacts/${c.id}/edit`} className="font-medium text-zinc-900 hover:underline">
                  {c.first_name} {c.last_name ?? ""}
                </Link>
              </td>
              <td className="py-2 pr-4 text-zinc-600">
                <CompanyLinks links={c.contact_companies as unknown as CompanyLink[]} />
              </td>
              <td className="py-2 pr-4 text-zinc-600">{c.job_title ?? "—"}</td>
              <td className="py-2 pr-4 text-zinc-600">{c.contact_role ?? "—"}</td>
              <td className="py-2 pr-4 text-zinc-600">{c.decision_maker_level ?? "—"}</td>
              <td className="py-2 pr-4 text-zinc-600">{c.email ?? "—"}</td>
              <td className="py-2 text-zinc-600">{c.phone ?? "—"}</td>
            </tr>
          ))}
          {contacts?.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-zinc-500">
                No contacts found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>
            Page {page} of {totalPages} ({count} total)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

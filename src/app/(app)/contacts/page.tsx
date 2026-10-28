import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import { query as dbQuery } from "@/lib/db";
import { contactVisibleSql } from "@/lib/visibility";

export const dynamic = "force-dynamic";

type CompanyLink = {
  is_primary: boolean;
  job_title: string | null;
  contact_role: string | null;
  decision_maker_level: string | null;
  is_verified: boolean;
  company: { id: number; name: string };
};
type Channel = { is_primary: boolean; is_verified: boolean; email?: string; phone?: string };

const primaryFirst = <T extends { is_primary: boolean }>(rows: T[] | null) =>
  [...(rows ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));

function Verified({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="ml-1 text-green-700" title="Verified">
      ✓
    </span>
  ) : (
    <span className="ml-1 text-xs text-amber-700" title="Not yet verified">
      unverified
    </span>
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

  // Which contacts, page by page: only those linked to a company this person may see.
  const actor = await getCurrentUser();
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = ["k.deleted_at IS NULL", contactVisibleSql(actor, "k", add)];
  const term = q?.trim();
  if (term) {
    const p = add(`%${term.replace(/[\\%_]/g, "\\$&")}%`);
    where.push(`(k.first_name ILIKE ${p} OR k.last_name ILIKE ${p}
      OR EXISTS (SELECT 1 FROM contact_emails e WHERE e.contact_id = k.id AND e.email ILIKE ${p})
      OR EXISTS (SELECT 1 FROM contact_companies t WHERE t.contact_id = k.id AND t.job_title ILIKE ${p}))`);
  }
  const whereSql = where.join(" AND ");
  const [idRows, [{ n: count }]] = await Promise.all([
    dbQuery<{ id: string }>(`SELECT k.id FROM contacts k WHERE ${whereSql} ORDER BY k.created_at DESC, k.id DESC LIMIT ${pageSize} OFFSET ${from}`, params),
    dbQuery<{ n: number }>(`SELECT count(*)::int AS n FROM contacts k WHERE ${whereSql}`, params),
  ]);
  const pageIds = idRows.map((r) => Number(r.id));
  const { data: unordered } = pageIds.length
    ? await supabase
        .from("contacts")
        .select(
          `id, first_name, last_name,
       contact_companies ( is_primary, job_title, contact_role, decision_maker_level, is_verified,
         company:company_id ( id, name ) ),
       contact_emails ( email, is_primary, is_verified ),
       contact_phones ( phone, is_primary, is_verified )`
        )
        .in("id", pageIds)
    : { data: [] };
  const order = new Map(pageIds.map((id, i) => [id, i]));
  const contacts = (unordered ?? []).sort((x, y) => (order.get(Number(x.id)) ?? 0) - (order.get(Number(y.id)) ?? 0));
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const pageHref = (p: number) => `/contacts?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-8">
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
          {contacts?.map((c) => {
            const links = primaryFirst(c.contact_companies as unknown as CompanyLink[]);
            const [first, ...others] = links;
            const email = primaryFirst(c.contact_emails as unknown as Channel[])[0];
            const phone = primaryFirst(c.contact_phones as unknown as Channel[])[0];
            return (
              <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                <td className="py-2 pr-4">
                  <Link href={`/contacts/${c.id}/edit`} className="font-medium text-zinc-900 hover:underline">
                    {c.first_name} {c.last_name ?? ""}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-zinc-600">
                  {first ? (
                    <>
                      <Link href={`/companies/${first.company.id}`} className="hover:underline">
                        {first.company.name}
                      </Link>
                      <Verified ok={first.is_verified} />
                      {others.length > 0 && (
                        <span className="ml-1 text-xs text-zinc-500" title={others.map((o) => o.company.name).join(", ")}>
                          +{others.length} more
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-4 text-zinc-600">{first?.job_title ?? "—"}</td>
                <td className="py-2 pr-4 text-zinc-600">{first?.contact_role ?? "—"}</td>
                <td className="py-2 pr-4 text-zinc-600">{first?.decision_maker_level ?? "—"}</td>
                <td className="py-2 pr-4 text-zinc-600">
                  {email ? (
                    <>
                      {email.email}
                      <Verified ok={email.is_verified} />
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 text-zinc-600">
                  {phone ? (
                    <>
                      {phone.phone}
                      <Verified ok={phone.is_verified} />
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
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

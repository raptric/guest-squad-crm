import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const supabase = await createClient();

  const pageSize = 20;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: contacts, count } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, job_title, company_id, companies(name)", {
      count: "exact",
    })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / pageSize));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Contacts</h1>
        <p className="text-sm text-zinc-500">Add contacts from a company&apos;s detail page.</p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Company</th>
            <th className="py-2 font-medium">Title</th>
            <th className="py-2 font-medium">Email</th>
            <th className="py-2 font-medium">Phone</th>
          </tr>
        </thead>
        <tbody>
          {contacts?.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50">
              <td className="py-2 font-medium text-zinc-900">
                {c.first_name} {c.last_name ?? ""}
              </td>
              <td className="py-2 text-zinc-600">
                {c.company_id && (
                  <Link href={`/companies/${c.company_id}`} className="hover:underline">
                    {(c.companies as unknown as { name: string } | null)?.name ?? "—"}
                  </Link>
                )}
              </td>
              <td className="py-2 text-zinc-600">{c.job_title ?? "—"}</td>
              <td className="py-2 text-zinc-600">{c.email ?? "—"}</td>
              <td className="py-2 text-zinc-600">{c.phone ?? "—"}</td>
            </tr>
          ))}
          {contacts?.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-zinc-500">
                No contacts yet.
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
              <Link href={`/contacts?page=${page - 1}`} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link href={`/contacts?page=${page + 1}`} className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

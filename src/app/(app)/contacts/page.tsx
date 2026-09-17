import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ContactsPage() {
  const supabase = await createClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, phone, job_title, company_id, companies(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

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
    </div>
  );
}

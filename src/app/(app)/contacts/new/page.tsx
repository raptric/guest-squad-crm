import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPicklistValues } from "@/lib/picklists";
import { ContactForm } from "../contact-form";

export const dynamic = "force-dynamic";

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ company_id?: string }>;
}) {
  const { company_id } = await searchParams;
  const supabase = await createClient();

  const [contactRoles, decisionMakerLevels, contactLineTypes, { data: company }] = await Promise.all([
    getPicklistValues("contact_role"),
    getPicklistValues("decision_maker_level"),
    getPicklistValues("contact_line_type"),
    company_id
      ? supabase.from("companies").select("id, name, company_type").eq("id", company_id).is("deleted_at", null).single()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">New Contact</h1>
        <Link href="/contacts" className="text-sm text-zinc-500 hover:text-zinc-700">
          Back to Contacts
        </Link>
      </div>

      <ContactForm
        contactRoles={contactRoles}
        decisionMakerLevels={decisionMakerLevels}
        contactLineTypes={contactLineTypes}
        initialValues={{ company }}
      />
    </div>
  );
}

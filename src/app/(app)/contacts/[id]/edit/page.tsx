import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPicklistValues } from "@/lib/picklists";
import { ContactForm, type ContactInitialValues } from "../../contact-form";

export const dynamic = "force-dynamic";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [contactRoles, decisionMakerLevels, contactLineTypes, { data: contact }] = await Promise.all([
    getPicklistValues("contact_role"),
    getPicklistValues("decision_maker_level"),
    getPicklistValues("contact_line_type"),
    supabase
      .from("contacts")
      .select(
        `id, first_name, last_name, email, phone, job_title, contact_role, decision_maker_level,
         contact_line_type, linkedin_url, company:company_id ( id, name, company_type )`
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
  ]);

  if (!contact) notFound();

  const { company, ...rest } = contact;
  const initialValues: ContactInitialValues = {
    ...rest,
    company: company as unknown as ContactInitialValues["company"],
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">
          Edit {contact.first_name} {contact.last_name ?? ""}
        </h1>
        <Link href="/contacts" className="text-sm text-zinc-500 hover:text-zinc-700">
          Back to Contacts
        </Link>
      </div>

      <ContactForm
        contactRoles={contactRoles}
        decisionMakerLevels={decisionMakerLevels}
        contactLineTypes={contactLineTypes}
        initialValues={initialValues}
        contactId={Number(id)}
      />
    </div>
  );
}

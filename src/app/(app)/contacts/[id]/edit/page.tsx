import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPicklistValues } from "@/lib/picklists";
import { ContactForm, type ContactInitialValues } from "../../contact-form";
import type { CompanyOption } from "../../contact-types";

export const dynamic = "force-dynamic";

type Provenance = {
  source_url: string | null;
  evidence: string | null;
  added_by_type: string;
  added_by_name: string | null;
  is_verified: boolean;
};
type LinkRecord = Provenance & {
  is_primary: boolean;
  job_title: string | null;
  contact_role: string | null;
  decision_maker_level: string | null;
  company: CompanyOption;
};
type ChannelRecord = Provenance & {
  is_primary: boolean;
  label: string | null;
  company_id: number | null;
  email?: string;
  phone?: string;
};

const primaryFirst = <T extends { is_primary: boolean }>(rows: T[]) =>
  [...rows].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));

const PROVENANCE = "is_verified, source_url, evidence, added_by_type, added_by_name";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [contactRoles, decisionMakerLevels, contactLineTypes, emailLabels, phoneLabels, { data: contact }] =
    await Promise.all([
      getPicklistValues("contact_role"),
      getPicklistValues("decision_maker_level"),
      getPicklistValues("contact_line_type"),
      getPicklistValues("email_label"),
      getPicklistValues("phone_label"),
      supabase
        .from("contacts")
        .select(
          `id, first_name, last_name, linkedin_url, contact_line_type,
           contact_companies ( is_primary, job_title, contact_role, decision_maker_level, ${PROVENANCE},
             company:company_id ( id, name, company_type ) ),
           contact_emails ( email, label, company_id, is_primary, ${PROVENANCE} ),
           contact_phones ( phone, label, company_id, is_primary, ${PROVENANCE} )`
        )
        .eq("id", id)
        .is("deleted_at", null)
        .single(),
    ]);

  if (!contact) notFound();

  const links = contact.contact_companies as unknown as LinkRecord[];
  const emails = contact.contact_emails as unknown as ChannelRecord[];
  const phones = contact.contact_phones as unknown as ChannelRecord[];

  const initialValues: ContactInitialValues = {
    first_name: contact.first_name,
    last_name: contact.last_name,
    linkedin_url: contact.linkedin_url,
    contact_line_type: contact.contact_line_type,
    // Primary first -- the form treats the first entry as primary.
    companies: primaryFirst(links).map((l) => ({
      company: l.company,
      job_title: l.job_title ?? "",
      contact_role: l.contact_role ?? "",
      decision_maker_level: l.decision_maker_level ?? "",
      is_verified: l.is_verified,
      source_url: l.source_url,
      evidence: l.evidence,
      added_by_type: l.added_by_type,
      added_by_name: l.added_by_name,
    })),
    emails: primaryFirst(emails).map((e) => channelRow(e, e.email!)),
    phones: primaryFirst(phones).map((p) => channelRow(p, p.phone!)),
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-8">
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
        emailLabels={emailLabels}
        phoneLabels={phoneLabels}
        initialValues={initialValues}
        contactId={Number(id)}
      />
    </div>
  );
}

function channelRow(r: ChannelRecord, value: string) {
  return {
    value,
    label: r.label ?? "",
    company_id: r.company_id === null ? null : Number(r.company_id),
    is_verified: r.is_verified,
    source_url: r.source_url,
    evidence: r.evidence,
    added_by_type: r.added_by_type,
    added_by_name: r.added_by_name,
  };
}

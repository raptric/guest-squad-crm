"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanyLinksEditor } from "./company-links-editor";
import { ChannelRowsEditor } from "./channel-rows-editor";
import type { ChannelRow, LinkRow } from "./contact-types";

export type ContactInitialValues = {
  first_name: string;
  last_name: string | null;
  linkedin_url: string | null;
  contact_line_type: string | null;
  companies: LinkRow[];
  emails: ChannelRow[];
  phones: ChannelRow[];
};

const inputClass = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";

export function ContactForm({
  contactRoles,
  decisionMakerLevels,
  contactLineTypes,
  emailLabels,
  phoneLabels,
  initialValues,
  contactId,
}: {
  contactRoles: string[];
  decisionMakerLevels: string[];
  contactLineTypes: string[];
  emailLabels: string[];
  phoneLabels: string[];
  initialValues?: Partial<ContactInitialValues>;
  contactId?: number;
}) {
  const router = useRouter();
  const isEdit = contactId !== undefined;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<LinkRow[]>(initialValues?.companies ?? []);
  const [emails, setEmails] = useState<ChannelRow[]>(initialValues?.emails ?? []);
  const [phones, setPhones] = useState<ChannelRow[]>(initialValues?.phones ?? []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const person = Object.fromEntries(new FormData(e.currentTarget).entries());
    const payload = {
      ...person,
      companies: companies.map((c) => ({
        company_id: c.company.id,
        job_title: c.job_title,
        contact_role: c.contact_role,
        decision_maker_level: c.decision_maker_level,
        is_verified: c.is_verified,
      })),
      emails: emails.map((r) => ({ email: r.value, label: r.label, company_id: r.company_id, is_verified: r.is_verified })),
      phones: phones.map((r) => ({ phone: r.value, label: r.label, company_id: r.company_id, is_verified: r.is_verified })),
    };

    const res = await fetch(isEdit ? `/api/contacts/${contactId}` : "/api/contacts", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Failed to save contact");
      return;
    }
    router.push("/contacts");
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this contact?")) return;
    setLoading(true);
    const res = await fetch(`/api/contacts/${contactId}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to delete contact");
      return;
    }
    router.push("/contacts");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Person</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" name="first_name" required defaultValue={initialValues?.first_name} />
          <Field label="Last name" name="last_name" defaultValue={initialValues?.last_name} />
        </div>
        <Field label="LinkedIn URL" name="linkedin_url" defaultValue={initialValues?.linkedin_url} />
        <div className="space-y-1">
          <label htmlFor="contact_line_type" className="text-sm font-medium text-zinc-700">
            Line Type
          </label>
          <select
            id="contact_line_type"
            name="contact_line_type"
            defaultValue={initialValues?.contact_line_type ?? ""}
            className={inputClass}
          >
            <option value="">—</option>
            {contactLineTypes.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Companies</legend>
        <p className="text-xs text-zinc-500">
          A person can work with several companies. Title, role and decision-maker level are set per company.
        </p>
        <CompanyLinksEditor value={companies} onChange={setCompanies} roles={contactRoles} levels={decisionMakerLevels} />
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Emails</legend>
        <ChannelRowsEditor
          kind="email"
          value={emails}
          onChange={setEmails}
          labels={emailLabels}
          companies={companies.map((c) => c.company)}
        />
      </fieldset>

      <fieldset className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Phones</legend>
        <ChannelRowsEditor
          kind="phone"
          value={phones}
          onChange={setPhones}
          labels={phoneLabels}
          companies={companies.map((c) => c.company)}
        />
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Saving..." : isEdit ? "Save Contact" : "Create Contact"}
        </button>
        <Link href="/contacts" className="text-sm text-zinc-500 hover:text-zinc-700">
          Cancel
        </Link>
        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="ml-auto text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
          >
            Delete contact
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string | null;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <input id={name} name={name} required={required} defaultValue={defaultValue ?? undefined} className={inputClass} />
    </div>
  );
}

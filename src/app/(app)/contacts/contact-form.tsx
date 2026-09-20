"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CompanyMultiPicker, type CompanyOption } from "./company-multi-picker";

export type ContactInitialValues = {
  companies: CompanyOption[];
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  contact_role: string | null;
  decision_maker_level: string | null;
  contact_line_type: string | null;
  linkedin_url: string | null;
};

const inputClass = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";

export function ContactForm({
  contactRoles,
  decisionMakerLevels,
  contactLineTypes,
  initialValues,
  contactId,
}: {
  contactRoles: string[];
  decisionMakerLevels: string[];
  contactLineTypes: string[];
  initialValues?: Partial<ContactInitialValues>;
  contactId?: number;
}) {
  const router = useRouter();
  const isEdit = contactId !== undefined;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[]>(initialValues?.companies ?? []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = {
      ...Object.fromEntries(new FormData(e.currentTarget).entries()),
      company_ids: companies.map((c) => c.id),
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
        <legend className="px-1 text-sm font-semibold text-zinc-900">Contact</legend>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Companies</label>
          <CompanyMultiPicker value={companies} onChange={setCompanies} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" name="first_name" required defaultValue={initialValues?.first_name} />
          <Field label="Last name" name="last_name" defaultValue={initialValues?.last_name} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" name="email" type="email" defaultValue={initialValues?.email} />
          <Field label="Phone" name="phone" defaultValue={initialValues?.phone} />
        </div>
        <Field label="Job title" name="job_title" defaultValue={initialValues?.job_title} />
        <Field label="LinkedIn URL" name="linkedin_url" defaultValue={initialValues?.linkedin_url} />
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Classification</legend>
        <div className="grid grid-cols-3 gap-3">
          <Select label="Role" name="contact_role" options={contactRoles} defaultValue={initialValues?.contact_role} />
          <Select
            label="Decision Maker"
            name="decision_maker_level"
            options={decisionMakerLevels}
            defaultValue={initialValues?.decision_maker_level}
          />
          <Select
            label="Line Type"
            name="contact_line_type"
            options={contactLineTypes}
            defaultValue={initialValues?.contact_line_type}
          />
        </div>
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
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | null;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? undefined}
        className={inputClass}
      />
    </div>
  );
}

function Select({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string | null;
}) {
  // A legacy value no longer in the picklist stays selectable so editing doesn't silently clear it.
  const all = defaultValue && !options.includes(defaultValue) ? [defaultValue, ...options] : options;
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <select id={name} name={name} defaultValue={defaultValue ?? ""} className={inputClass}>
        <option value="">—</option>
        {all.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

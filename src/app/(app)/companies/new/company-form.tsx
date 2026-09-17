"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  COMPANY_TYPES,
  LIFECYCLE_STAGES,
  LEAD_STATUSES,
  PROSPECT_TIERS,
  PROPERTY_TYPES,
  PROPERTY_CLASSES,
  PORTFOLIO_ROLES,
} from "@/lib/companies/constants";
import { ParentCompanyCombobox } from "./parent-company-combobox";

type UserOption = { id: number; name: string };

export function CompanyForm({ users }: { users: UserOption[] }) {
  const router = useRouter();
  const [companyType, setCompanyType] = useState<string>(COMPANY_TYPES[0]);
  const [hasParent, setHasParent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isProperty = companyType === "Property";
  const isPortfolioCapable = companyType !== "Property";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Failed to create company");
      return;
    }

    router.push(`/companies/${body.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Basic Info</legend>

        <Field label="Name" name="name" required />
        <Field label="Website" name="website" />

        <div className="space-y-1">
          <label htmlFor="company_type" className="text-sm font-medium text-zinc-700">
            Company Type
          </label>
          <select
            id="company_type"
            name="company_type"
            value={companyType}
            onChange={(e) => setCompanyType(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {COMPANY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Portfolio / Group</legend>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={hasParent}
            onChange={(e) => setHasParent(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Part of a portfolio or group already in the system
        </label>

        {hasParent && (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-700">Parent Company</label>
              <ParentCompanyCombobox name="parent_company_id" />
            </div>

            {isProperty && (
              <SelectField
                label="Relationship to Portfolio"
                name="portfolio_role"
                options={PORTFOLIO_ROLES.filter((r) => r !== "Independent")}
              />
            )}
          </>
        )}

        {isPortfolioCapable && (
          <Field
            label="Portfolio Size (total properties in this group, if known)"
            name="portfolio_size"
            type="number"
            min={0}
          />
        )}
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Address</legend>
        <Field label="Address Line 1" name="address_line_1" />
        <Field label="Address Line 2" name="address_line_2" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" name="city" />
          <Field label="State" name="state" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country" name="country" />
          <Field label="Zip" name="zip" />
        </div>
        <Field label="Phone" name="phone" />
      </fieldset>

      {isProperty && (
        <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-zinc-900">Property Profile</legend>

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Property Type" name="property_type" options={PROPERTY_TYPES} allowEmpty />
            <SelectField label="Class" name="property_class" options={PROPERTY_CLASSES} allowEmpty />
          </div>

          <Field label="Rooms / Units" name="rooms_units" type="number" min={0} />
        </fieldset>
      )}

      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Lifecycle &amp; Qualification</legend>

        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Lifecycle Stage" name="lifecycle_stage" options={LIFECYCLE_STAGES} />
          <SelectField label="Lead Status" name="lead_status" options={LEAD_STATUSES} />
        </div>

        <SelectField label="Prospect Tier" name="prospect_tier" options={PROSPECT_TIERS} allowEmpty />

        <TextAreaField label="Qualification Summary" name="qualification_summary" />
        <TextAreaField label="Why Now (SDR Signal Summary)" name="sdr_signal_summary" />
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Ownership</legend>
        <div className="space-y-1">
          <label htmlFor="owner_id" className="text-sm font-medium text-zinc-700">
            Owner
          </label>
          <select
            id="owner_id"
            name="owner_id"
            defaultValue=""
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create Company"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  type = "text",
  min,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  min?: number;
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
        min={min}
        required={required}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function TextAreaField({ label, name }: { label: string; name: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  allowEmpty,
}: {
  label: string;
  name: string;
  options: readonly string[];
  allowEmpty?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={allowEmpty ? "" : options[0]}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      >
        {allowEmpty && <option value="">—</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

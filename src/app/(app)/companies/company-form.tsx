"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ParentCompanyCombobox } from "./parent-company-combobox";

type UserOption = { id: number; name: string };

export type CompanyInitialValues = {
  name: string;
  website: string | null;
  company_type: string;
  parent: { id: number; name: string; company_type: string } | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
  lifecycle_stage: string;
  lead_status: string;
  prospect_tier: string | null;
  qualification_summary: string | null;
  sdr_signal_summary: string | null;
  owner_id: number | null;
  portfolio_size: number | null;
  property_type: string | null;
  property_class: string | null;
  rooms_units: number | null;
  portfolio_role: string | null;
};

export function CompanyForm({
  users,
  lifecycleStages,
  leadStatuses,
  companyTypes,
  propertyTypes,
  propertyClasses,
  portfolioRoles,
  prospectTiers,
  countries,
  initialValues,
  companyId,
}: {
  users: UserOption[];
  lifecycleStages: string[];
  leadStatuses: string[];
  companyTypes: string[];
  propertyTypes: string[];
  propertyClasses: string[];
  portfolioRoles: string[];
  prospectTiers: string[];
  countries: string[];
  initialValues?: CompanyInitialValues;
  companyId?: number;
}) {
  const router = useRouter();
  const isEdit = companyId !== undefined;
  const [companyType, setCompanyType] = useState<string>(initialValues?.company_type ?? companyTypes[0]);
  const [hasParent, setHasParent] = useState(Boolean(initialValues?.parent));
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

    const res = await fetch(isEdit ? `/api/companies/${companyId}` : "/api/companies", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const body = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Failed to save company");
      return;
    }

    router.push(`/companies/${isEdit ? companyId : body.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Basic Info</legend>

        <Field label="Name" name="name" required defaultValue={initialValues?.name} />
        <Field label="Website" name="website" defaultValue={initialValues?.website ?? undefined} />

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
            {companyTypes.map((t) => (
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
              <ParentCompanyCombobox
                name="parent_company_id"
                initialValue={initialValues?.parent}
                excludeId={companyId}
              />
            </div>

            {isProperty && (
              <SelectField
                label="Relationship to Portfolio"
                name="portfolio_role"
                options={portfolioRoles.filter((r) => r !== "Independent")}
                defaultValue={initialValues?.portfolio_role ?? undefined}
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
            defaultValue={initialValues?.portfolio_size ?? undefined}
          />
        )}
      </fieldset>

      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Address</legend>
        <Field label="Address Line 1" name="address_line_1" defaultValue={initialValues?.address_line_1 ?? undefined} />
        <Field label="Address Line 2" name="address_line_2" defaultValue={initialValues?.address_line_2 ?? undefined} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" name="city" defaultValue={initialValues?.city ?? undefined} />
          <Field label="State" name="state" defaultValue={initialValues?.state ?? undefined} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Country"
            name="country"
            options={countries}
            allowEmpty
            defaultValue={initialValues?.country ?? undefined}
          />
          <Field label="Zip" name="zip" defaultValue={initialValues?.zip ?? undefined} />
        </div>
        <Field label="Phone" name="phone" defaultValue={initialValues?.phone ?? undefined} />
      </fieldset>

      {isProperty && (
        <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
          <legend className="px-1 text-sm font-semibold text-zinc-900">Property Profile</legend>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Property Type"
              name="property_type"
              options={propertyTypes}
              allowEmpty
              defaultValue={initialValues?.property_type ?? undefined}
            />
            <SelectField
              label="Class"
              name="property_class"
              options={propertyClasses}
              allowEmpty
              defaultValue={initialValues?.property_class ?? undefined}
            />
          </div>

          <Field
            label="Rooms / Units"
            name="rooms_units"
            type="number"
            min={0}
            defaultValue={initialValues?.rooms_units ?? undefined}
          />
        </fieldset>
      )}

      <fieldset className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <legend className="px-1 text-sm font-semibold text-zinc-900">Lifecycle &amp; Qualification</legend>

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Lifecycle Stage"
            name="lifecycle_stage"
            options={lifecycleStages}
            defaultValue={initialValues?.lifecycle_stage}
          />
          <SelectField
            label="Lead Status"
            name="lead_status"
            options={leadStatuses}
            defaultValue={initialValues?.lead_status}
          />
        </div>

        <SelectField
          label="Prospect Tier"
          name="prospect_tier"
          options={prospectTiers}
          allowEmpty
          defaultValue={initialValues?.prospect_tier ?? undefined}
        />

        <TextAreaField
          label="Qualification Summary"
          name="qualification_summary"
          defaultValue={initialValues?.qualification_summary ?? undefined}
        />
        <TextAreaField
          label="Why Now (SDR Signal Summary)"
          name="sdr_signal_summary"
          defaultValue={initialValues?.sdr_signal_summary ?? undefined}
        />
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
            defaultValue={initialValues?.owner_id ?? ""}
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
        {loading ? "Saving..." : isEdit ? "Save Changes" : "Create Company"}
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
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  min?: number;
  defaultValue?: string | number;
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
        defaultValue={defaultValue}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
      />
    </div>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        defaultValue={defaultValue}
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
  defaultValue,
}: {
  label: string;
  name: string;
  options: readonly string[];
  allowEmpty?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-sm font-medium text-zinc-700">
        {label}
      </label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? (allowEmpty ? "" : options[0])}
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

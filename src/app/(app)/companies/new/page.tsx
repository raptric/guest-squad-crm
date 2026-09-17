"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { COMPANY_TYPES, LIFECYCLE_STAGES, LEAD_STATUSES } from "@/lib/companies/constants";

export default function NewCompanyPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [companyType, setCompanyType] = useState<string>(COMPANY_TYPES[0]);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState(LIFECYCLE_STAGES[0]);
  const [leadStatus, setLeadStatus] = useState(LEAD_STATUSES[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        website,
        company_type: companyType,
        city,
        country,
        lifecycle_stage: lifecycleStage,
        lead_status: leadStatus,
      }),
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
    <div className="mx-auto w-full max-w-lg space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">New Company</h1>
        <Link href="/companies" className="text-sm text-zinc-500 hover:text-zinc-700">
          Back to Companies
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium text-zinc-700">
            Name
          </label>
          <input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="website" className="text-sm font-medium text-zinc-700">
            Website
          </label>
          <input
            id="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="company_type" className="text-sm font-medium text-zinc-700">
            Company Type
          </label>
          <select
            id="company_type"
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="city" className="text-sm font-medium text-zinc-700">
              City
            </label>
            <input
              id="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="country" className="text-sm font-medium text-zinc-700">
              Country
            </label>
            <input
              id="country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="lifecycle_stage" className="text-sm font-medium text-zinc-700">
              Lifecycle Stage
            </label>
            <select
              id="lifecycle_stage"
              value={lifecycleStage}
              onChange={(e) => setLifecycleStage(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {LIFECYCLE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="lead_status" className="text-sm font-medium text-zinc-700">
              Lead Status
            </label>
            <select
              id="lead_status"
              value={leadStatus}
              onChange={(e) => setLeadStatus(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Company"}
        </button>
      </form>
    </div>
  );
}

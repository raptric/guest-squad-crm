"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { roleLabel } from "@/lib/roles";

export function ProfileForm({
  name,
  email,
  role,
  phone,
  jobTitle,
}: {
  name: string;
  email: string;
  role: string;
  phone: string;
  jobTitle: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [phoneValue, setPhoneValue] = useState(phone);
  const [jobTitleValue, setJobTitleValue] = useState(jobTitle);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value, phone: phoneValue, job_title: jobTitleValue }),
    });

    setSaving(false);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">Email</label>
        <p className="text-sm text-zinc-500">{email}</p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">Role</label>
        <p className="text-sm text-zinc-500">{roleLabel(role)}</p>
      </div>

      <div className="space-y-1">
        <label htmlFor="name" className="text-sm font-medium text-zinc-700">
          Name
        </label>
        <input
          id="name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="job_title" className="text-sm font-medium text-zinc-700">
          Job title
        </label>
        <input
          id="job_title"
          value={jobTitleValue}
          onChange={(e) => setJobTitleValue(e.target.value)}
          maxLength={100}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="phone" className="text-sm font-medium text-zinc-700">
          Phone
        </label>
        <input
          id="phone"
          type="tel"
          value={phoneValue}
          onChange={(e) => setPhoneValue(e.target.value)}
          maxLength={50}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

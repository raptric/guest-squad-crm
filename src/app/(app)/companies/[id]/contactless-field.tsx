"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Property profile checkbox. Saves as soon as it is ticked or cleared; cleared means "not recorded".
export function ContactlessField({ companyId, value }: { companyId: number; value: boolean | null }) {
  const router = useRouter();
  const [checked, setChecked] = useState(value === true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setChecked(next);
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/field`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "property", field: "contactless", value: next ? "true" : "" }),
    });
    setSaving(false);
    if (!res.ok) {
      setChecked(!next);
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't save");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <dt className="text-xs font-medium text-zinc-500">Contactless</dt>
      <dd className="mt-0.5 text-sm text-zinc-900">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={checked} disabled={saving} onChange={(e) => toggle(e.target.checked)} className="h-4 w-4 rounded border-zinc-300" />
          <span className={checked ? "" : "text-zinc-400"}>{checked ? "Yes" : "Not recorded"}</span>
        </label>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </dd>
    </div>
  );
}

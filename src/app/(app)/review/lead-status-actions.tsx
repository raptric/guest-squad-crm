"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LeadStatusActions({ companyId }: { companyId: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"Qualified" | "DisQualified" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(lead_status: "Qualified" | "DisQualified") {
    setError(null);
    setLoading(lead_status);
    const res = await fetch(`/api/companies/${companyId}/lead-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_status }),
    });
    setLoading(null);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to update");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setStatus("Qualified")}
        disabled={loading !== null}
        className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading === "Qualified" ? "..." : "Mark Qualified"}
      </button>
      <button
        onClick={() => setStatus("DisQualified")}
        disabled={loading !== null}
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {loading === "DisQualified" ? "..." : "Mark DisQualified"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

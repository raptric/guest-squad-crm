"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Archive / restore a campaign. Archived campaigns can't be used for new enrollments; running ones carry on.
export function CampaignStatusButton({ id, status, activeEnrollments }: { id: string; status: string; activeEnrollments: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archiving = status === "active";

  async function toggle() {
    if (archiving && !confirm(`Archive this campaign? ${activeEnrollments ? `${activeEnrollments} running ${activeEnrollments === 1 ? "enrollment carries" : "enrollments carry"} on, but` : "It"} can't be used for new enrollments until you restore it.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: archiving ? "archived" : "active" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <span>
      <button onClick={toggle} disabled={busy} className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
        {busy ? "..." : archiving ? "Archive" : "Restore"}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}

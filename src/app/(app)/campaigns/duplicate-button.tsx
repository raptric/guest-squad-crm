"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Copies a campaign you can see: details, steps and messaging (not the enrollments). The copy is your own Private Draft.
export function DuplicateButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function duplicate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${id}/duplicate`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't duplicate");
      return;
    }
    const { id: newId } = await res.json();
    router.push(`/campaigns/${newId}`);
    router.refresh();
  }

  return (
    <span>
      <button onClick={duplicate} disabled={busy} className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
        {busy ? "..." : "Duplicate"}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
    </span>
  );
}

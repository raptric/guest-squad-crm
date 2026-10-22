"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Manual "mark completed" for an open campaign. One-way -- there is no reopen.
export function BatchStatusButton({ id, name }: { id: number; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!confirm(`Mark "${name}" as completed? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/import-batches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={busy}
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {busy ? "..." : "Mark completed"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

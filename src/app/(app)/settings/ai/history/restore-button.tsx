"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RestoreButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (!window.confirm("Put this version back? The current one stays in the history.")) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/ai/versions/${id}/restore`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't restore");
      return;
    }
    router.refresh();
  }

  return (
    <div className="text-right">
      <button onClick={restore} disabled={busy} className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
        {busy ? "Restoring…" : "Restore"}
      </button>
      {error && <p className="mt-1 max-w-48 text-xs text-red-600">{error}</p>}
    </div>
  );
}

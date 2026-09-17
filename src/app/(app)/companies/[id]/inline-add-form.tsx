"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InlineAddForm({
  buttonLabel,
  submitLabel,
  endpoint,
  children,
}: {
  buttonLabel: string;
  submitLabel: string;
  endpoint: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to save");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {buttonLabel}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      {children}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Saving..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

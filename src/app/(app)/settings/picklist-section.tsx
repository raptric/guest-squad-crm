"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PicklistValue = { id: number; value: string };

export function PicklistSection({
  title,
  fieldName,
  values,
}: {
  title: string;
  fieldName: string;
  values: PicklistValue[];
}) {
  const router = useRouter();
  const [newValue, setNewValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/picklists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field_name: fieldName, value: newValue }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Failed to add value");
      return;
    }

    setNewValue("");
    router.refresh();
  }

  async function handleRemove(id: number) {
    setRemovingId(id);
    await fetch(`/api/picklists/${id}`, { method: "DELETE" });
    setRemovingId(null);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>

      <ul className="divide-y divide-zinc-100 text-sm">
        {values.map((v) => (
          <li key={v.id} className="flex items-center justify-between py-2">
            <span className="text-zinc-900">{v.value}</span>
            <button
              onClick={() => handleRemove(v.id)}
              disabled={removingId === v.id}
              className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
            >
              {removingId === v.id ? "Removing..." : "Remove"}
            </button>
          </li>
        ))}
        {values.length === 0 && <li className="py-2 text-zinc-500">No values yet.</li>}
      </ul>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="New value"
          required
          className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Adding..." : "Add"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

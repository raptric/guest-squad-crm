"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TeamRow = { id: number; name: string; memberCount: number; lead: string | null };

const button = "rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

// Admin: create, rename and delete teams. Who belongs to a team is set per person on the Users tab.
export function TeamsPanel({ teams }: { teams: TeamRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch("/api/admin/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreating(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't create the team");
      return;
    }
    setName("");
    router.refresh();
  }

  async function rename(id: number) {
    setBusyId(id);
    setRowError(null);
    const res = await fetch(`/api/admin/teams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    setBusyId(null);
    if (!res.ok) {
      setRowError({ id, message: (await res.json()).error ?? "Couldn't rename" });
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function remove(team: TeamRow) {
    if (!confirm(`Delete the team "${team.name}"?`)) return;
    setBusyId(team.id);
    setRowError(null);
    const res = await fetch(`/api/admin/teams/${team.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      setRowError({ id: team.id, message: (await res.json()).error ?? "Couldn't delete" });
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="space-y-1">
          <label htmlFor="team-name" className="text-xs font-medium text-zinc-700">
            New team
          </label>
          <input
            id="team-name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sales East"
            className="w-64 rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {creating ? "Adding..." : "Add team"}
        </button>
        {error && <p className="w-full text-sm text-red-600">{error}</p>}
      </form>

      {teams.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-500">
          No teams yet. Add your first team above, then assign people to it from the Users tab.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="py-2 pr-4 font-medium">Team</th>
              <th className="py-2 pr-4 font-medium">Team lead</th>
              <th className="py-2 pr-4 font-medium">Members</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className="border-b border-zinc-100 align-top">
                <td className="py-3 pr-4">
                  {editingId === t.id ? (
                    <input
                      autoFocus
                      value={editName}
                      maxLength={100}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(t.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-64 rounded-md border border-sky-400 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  ) : (
                    <span className="font-medium text-zinc-900">{t.name}</span>
                  )}
                  {rowError?.id === t.id && <p className="mt-1 text-xs text-red-600">{rowError.message}</p>}
                </td>
                <td className="py-3 pr-4 text-zinc-600">{t.lead ?? <span className="text-zinc-400">No lead yet</span>}</td>
                <td className="py-3 pr-4 text-zinc-600">{t.memberCount}</td>
                <td className="py-3">
                  <div className="flex gap-2">
                    {editingId === t.id ? (
                      <>
                        <button className={button} disabled={busyId === t.id} onClick={() => rename(t.id)}>
                          Save
                        </button>
                        <button className={button} onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={button}
                          onClick={() => {
                            setEditingId(t.id);
                            setEditName(t.name);
                            setRowError(null);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          className={`${button} hover:border-red-300 hover:text-red-600`}
                          disabled={busyId === t.id}
                          onClick={() => remove(t)}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/lib/roles";

const field = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none";

export function CreateUserForm({ teams }: { teams: { id: number; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role, team_id: role === "super_admin" || !teamId ? null : Number(teamId) }),
    });
    const body = await res.json();

    setLoading(false);

    if (!res.ok) {
      setError(body.error ?? "Failed to create user");
      return;
    }

    setName("");
    setEmail("");
    setRole("user");
    setTeamId("");
    setSuccess(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-4"
    >
      <div className="space-y-1">
        <label htmlFor="name" className="text-xs font-medium text-zinc-700">
          Name
        </label>
        <input id="name" required value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="text-xs font-medium text-zinc-700">
          Email
        </label>
        <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      </div>

      <div className="space-y-1">
        <label htmlFor="role" className="text-xs font-medium text-zinc-700">
          Role
        </label>
        <select id="role" value={role} onChange={(e) => setRole(e.target.value)} className={field}>
          <option value="user">{ROLE_LABELS.user}</option>
          <option value="team_lead">{ROLE_LABELS.team_lead}</option>
          <option value="super_admin">{ROLE_LABELS.super_admin}</option>
        </select>
      </div>

      {role !== "super_admin" && (
        <div className="space-y-1">
          <label htmlFor="team" className="text-xs font-medium text-zinc-700">
            Team{role === "team_lead" ? " (required)" : ""}
          </label>
          <select id="team" value={teamId} required={role === "team_lead"} onChange={(e) => setTeamId(e.target.value)} className={field}>
            <option value="">{teams.length ? "No team" : "No teams yet"}</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? "Inviting..." : "Invite user"}
      </button>

      {error && <p className="w-full text-sm text-red-600">{error}</p>}
      {success && <p className="w-full text-sm text-green-600">Invite sent.</p>}
    </form>
  );
}

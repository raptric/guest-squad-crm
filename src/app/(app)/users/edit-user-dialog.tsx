"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/lib/roles";

const input = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";

export function EditUserDialog({
  userId,
  email,
  name,
  phone,
  jobTitle,
  role,
  teamId,
  teams,
  isSelf,
  onClose,
}: {
  userId: number;
  email: string;
  name: string;
  phone: string;
  jobTitle: string;
  role: string;
  teamId: number | null;
  teams: { id: number; name: string }[];
  isSelf: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ name, phone, job_title: jobTitle, role, team_id: teamId ? String(teamId) : "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        phone: form.phone,
        job_title: form.job_title,
        role: form.role,
        team_id: form.role === "super_admin" || !form.team_id ? null : Number(form.team_id),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to save");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-zinc-900">Edit user</h2>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Email</label>
          <p className="text-sm text-zinc-500">{email}</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="edit-name" className="text-sm font-medium text-zinc-700">Name</label>
          <input id="edit-name" required className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>

        <div className="space-y-1">
          <label htmlFor="edit-role" className="text-sm font-medium text-zinc-700">Role</label>
          <select
            id="edit-role"
            className={input}
            value={form.role}
            disabled={isSelf}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="user">{ROLE_LABELS.user}</option>
            <option value="team_lead">{ROLE_LABELS.team_lead}</option>
            <option value="super_admin">{ROLE_LABELS.super_admin}</option>
          </select>
          {isSelf && <p className="text-xs text-zinc-500">You can&apos;t change your own role.</p>}
        </div>

        {form.role !== "super_admin" && (
          <div className="space-y-1">
            <label htmlFor="edit-team" className="text-sm font-medium text-zinc-700">
              Team{form.role === "team_lead" ? " (required for a team lead)" : ""}
            </label>
            <select
              id="edit-team"
              className={input}
              value={form.team_id}
              onChange={(e) => setForm({ ...form, team_id: e.target.value })}
            >
              <option value="">{teams.length ? "No team" : "No teams yet"}</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="edit-job" className="text-sm font-medium text-zinc-700">Job title</label>
          <input id="edit-job" maxLength={100} className={input} value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} />
        </div>

        <div className="space-y-1">
          <label htmlFor="edit-phone" className="text-sm font-medium text-zinc-700">Phone</label>
          <input id="edit-phone" type="tel" maxLength={50} className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

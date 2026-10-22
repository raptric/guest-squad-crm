"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";

export function EditUserDialog({
  userId,
  email,
  name,
  phone,
  jobTitle,
  role,
  isSelf,
  onClose,
}: {
  userId: number;
  email: string;
  name: string;
  phone: string;
  jobTitle: string;
  role: string;
  isSelf: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ name, phone, job_title: jobTitle, role });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
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
            <option value="user">User</option>
            <option value="super_admin">Super admin</option>
          </select>
          {isSelf && <p className="text-xs text-zinc-500">You can&apos;t change your own role.</p>}
        </div>

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

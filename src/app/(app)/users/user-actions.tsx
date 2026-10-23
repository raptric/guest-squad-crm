"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EditUserDialog } from "./edit-user-dialog";

export type UserStatus = "active" | "pending" | "blocked";
type Action = "resend_invite" | "reset_password" | "block" | "unblock";

const button = "rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

export function UserActions({
  userId,
  name,
  email,
  phone,
  jobTitle,
  role,
  teamId,
  teams,
  status,
  isSelf,
}: {
  userId: number;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
  role: string;
  teamId: number | null;
  teams: { id: number; name: string }[];
  status: UserStatus;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function run(action: Action) {
    if (action === "block" && !confirm(`Block ${name}? They'll be signed out and won't be able to log in until unblocked.`)) return;
    setBusy(action);
    setMessage(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await res.json();
    setBusy(null);
    setMessage({ text: body.message ?? body.error ?? "Something went wrong", ok: res.ok });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy !== null} onClick={() => setEditing(true)}>
          Edit
        </button>
        {status === "pending" && (
          <button className={button} disabled={busy !== null} onClick={() => run("resend_invite")}>
            {busy === "resend_invite" ? "Sending..." : "Re-send invite"}
          </button>
        )}
        {status === "active" && (
          <button className={button} disabled={busy !== null} onClick={() => run("reset_password")}>
            {busy === "reset_password" ? "Sending..." : "Reset password"}
          </button>
        )}
        {status === "blocked" ? (
          <button className={button} disabled={busy !== null} onClick={() => run("unblock")}>
            {busy === "unblock" ? "..." : "Unblock"}
          </button>
        ) : (
          !isSelf && (
            <button
              className={`${button} hover:border-red-300 hover:text-red-600`}
              disabled={busy !== null}
              onClick={() => run("block")}
            >
              {busy === "block" ? "..." : "Block"}
            </button>
          )
        )}
      </div>
      {message && <p className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>}
      {editing && (
        <EditUserDialog userId={userId} email={email} name={name} phone={phone} jobTitle={jobTitle} role={role} teamId={teamId} teams={teams} isSelf={isSelf} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

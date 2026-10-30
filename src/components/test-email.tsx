"use client";

import { useState } from "react";
import Link from "next/link";

const KEY = "gsq:test-email-to";
const remembered = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

// "Send test email": asks for an address and sends the email there from the person's own Gmail, signature included, so they can see
// it in a real inbox. subject and body are read when the button is clicked, with the names already filled in.
export function TestEmail({ getEmail, defaultTo = "" }: { getEmail: () => { subject: string; body: string }; defaultTo?: string }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string; setup?: boolean } | null>(null);

  async function send() {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/mail/test-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, ...getEmail() }) });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as { error?: string; needs_setup?: boolean };
    if (!res.ok) return setNote({ ok: false, text: data.error ?? "The test email could not be sent", setup: data.needs_setup });
    try {
      localStorage.setItem(KEY, to.trim());
    } catch {}
    setNote({ ok: true, text: `Sent to ${to.trim()}. Check that inbox (and spam) to see how it looks.` });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setTo(remembered() || defaultTo);
          setNote(null);
          setOpen(true);
        }}
        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline"
      >
        Send test email
      </button>
    );
  }
  return (
    <div className="basis-full space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
      <p className="text-xs text-zinc-600">Send this email to an address you choose, from your own Gmail, with your signature. Nothing is recorded and no step is marked done.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Email address to send the test to" aria-label="Send the test to" disabled={busy} className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 sm:max-w-xs" />
        <button type="button" onClick={send} disabled={busy || !to.trim()} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
          {busy ? "Sending…" : "Send test"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy} className="text-sm text-zinc-500 hover:text-zinc-800">
          Close
        </button>
      </div>
      {note && (
        <p className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>
          {note.text}
          {note.setup && (
            <>
              {" "}
              <Link href="/profile" className="text-sky-700 hover:underline">
                Open your Profile
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

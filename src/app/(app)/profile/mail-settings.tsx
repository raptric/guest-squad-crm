"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60";
type Note = { ok: boolean; text: string } | null;

// Profile -> Email sending: the Gmail address and app password that campaign emails are sent from.
export function MailSettings({ saved, secretReady }: { saved: { address: string; verified_at: string } | null; secretReady: boolean }) {
  const router = useRouter();
  const [address, setAddress] = useState(saved?.address ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [help, setHelp] = useState(false);

  async function save() {
    setBusy("save");
    setNote(null);
    const res = await fetch("/api/profile/mail", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address, password }) });
    setBusy(null);
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return setNote({ ok: false, text: data.error ?? "Couldn't save" });
    setPassword("");
    setNote({ ok: true, text: "Gmail accepted the login and it is saved." });
    router.refresh();
  }

  async function test() {
    setBusy("test");
    setNote(null);
    const res = await fetch("/api/profile/mail/test", { method: "POST" });
    setBusy(null);
    const data = (await res.json().catch(() => ({}))) as { error?: string; to?: string };
    setNote(res.ok ? { ok: true, text: `Sent. Check the inbox of ${data.to}.` } : { ok: false, text: data.error ?? "The test failed" });
  }

  async function remove() {
    if (!window.confirm("Remove your Gmail login from the CRM? You will not be able to send from the CRM until you add it again.")) return;
    setBusy("remove");
    setNote(null);
    await fetch("/api/profile/mail", { method: "DELETE" });
    setBusy(null);
    setPassword("");
    setAddress("");
    router.refresh();
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">Email sending</h2>
        <p className="text-sm text-zinc-500">Add your Gmail address and an app password, and campaign emails can be sent from your own inbox with one click. A copy stays in your Gmail Sent folder.</p>
      </div>

      {!secretReady && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">This server is not set up to store passwords yet. Ask an admin.</p>}

      {saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Connected as <span className="font-medium">{saved.address}</span>. The password is stored encrypted and is never shown again.
        </p>
      )}

      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-700">Gmail address</span>
          <input type="email" value={address} onChange={(e) => setAddress(e.target.value)} disabled={busy !== null} placeholder="you@gmail.com (or your Google Workspace address)" className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-zinc-700">{saved ? "New app password" : "App password"}</span>
          <input
            type="password"
            autoComplete="new-password"
            data-lpignore="true"
            spellCheck={false}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy !== null}
            placeholder={saved ? "Paste a new one only to replace it" : "16 letters, like abcd efgh ijkl mnop"}
            className={input}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={save} disabled={busy !== null || !secretReady || !address.trim() || !password.trim()} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            {busy === "save" ? "Checking with Gmail…" : saved ? "Replace login" : "Save"}
          </button>
          {saved && (
            <>
              <button onClick={test} disabled={busy !== null} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
                {busy === "test" ? "Sending…" : "Send me a test email"}
              </button>
              <button onClick={remove} disabled={busy !== null} className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">
                Remove
              </button>
            </>
          )}
        </div>
        {note && <p className={`text-sm ${note.ok ? "text-emerald-700" : "text-red-600"}`}>{note.text}</p>}
      </div>

      <div className="border-t border-zinc-100 pt-3">
        <button onClick={() => setHelp((v) => !v)} className="text-sm font-medium text-sky-700 hover:underline">
          {help ? "Hide" : "How do I get an app password?"}
        </button>
        {help && (
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-zinc-600">
            <li>
              Turn on <strong>2-Step Verification</strong> for your Google account (myaccount.google.com → Security). App passwords need it.
            </li>
            <li>
              Open{" "}
              <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                myaccount.google.com/apppasswords
              </a>
              , give it a name such as &quot;Guest Squad CRM&quot;, and click Create.
            </li>
            <li>Copy the 16-letter password Google shows and paste it above. Spaces don&apos;t matter.</li>
            <li>On a Google Workspace address, if the page is missing, your Workspace admin has to allow app passwords first.</li>
            <li>You can delete the app password in Google at any time, and sending from the CRM stops.</li>
          </ol>
        )}
      </div>
    </section>
  );
}

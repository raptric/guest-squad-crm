"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ShieldCheckIcon } from "../../icons";
import {
  VERIFICATION_INCOMPLETE,
  VERIFICATION_READY,
  verificationLabel,
  VERIFY_FIELD_GROUPS,
  VERIFY_FIELD_LABELS,
} from "@/lib/verification";

export type LastReview = { reviewer: string; when: string; hadErrors: boolean; notes: string | null };

// Quick human check of the AI's research: "Everything is correct" in one click, or tick the
// incorrect fields, add notes, and confirm whether they were all fixed.
export function VerifyBox({
  companyId,
  status,
  last,
}: {
  companyId: number;
  status: string | null;
  last: LastReview | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(status === null);
  const [hasErrors, setHasErrors] = useState(false);
  const [fields, setFields] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) => setFields((f) => (f.includes(key) ? f.filter((k) => k !== key) : [...f, key]));

  async function save(payload: { has_errors: boolean; fields?: string[]; fixed_all?: boolean; notes?: string }) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to save");
      setConfirming(false);
      return;
    }
    setConfirming(false);
    setHasErrors(false);
    setFields([]);
    setNotes("");
    setOpen(false);
    router.refresh();
  }

  const badge =
    status === VERIFICATION_READY
      ? "bg-emerald-100 text-emerald-800"
      : status === VERIFICATION_INCOMPLETE
        ? "bg-amber-100 text-amber-800"
        : "bg-zinc-100 text-zinc-600";

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-3 text-base font-semibold text-zinc-900">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
            <ShieldCheckIcon className="h-5 w-5" />
          </span>
          Verify research
        </h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge}`}>{status === VERIFICATION_READY && last ? `Verified · ${last.reviewer}` : verificationLabel(status)}</span>
      </div>

      {last && (
        <p className="text-xs text-zinc-500">
          Last reviewed by {last.reviewer}, {last.when}.
          {last.notes && <span className="mt-1 block whitespace-pre-wrap text-zinc-600">{last.notes}</span>}
        </p>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Review again
        </button>
      ) : (
        <div className="space-y-3">
          {!hasErrors && (
            <button
              onClick={() => save({ has_errors: false })}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              <CheckIcon className="h-5 w-5" />
              {saving ? "Saving..." : "Everything is correct"}
            </button>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
            <input type="checkbox" checked={hasErrors} onChange={(e) => setHasErrors(e.target.checked)} className="h-4 w-4" />
            There are errors in this record
          </label>

          {hasErrors && (
            <div className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Tick every field that was wrong or missing, then fix it right on the page: click any value to edit it.</p>
              {VERIFY_FIELD_GROUPS.map((group) => (
                <div key={group.title}>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{group.title}</p>
                  <div className="grid grid-cols-1 gap-1">
                    {group.fields.map((f) => (
                      <label key={f.key} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
                        <input type="checkbox" checked={fields.includes(f.key)} onChange={() => toggle(f.key)} className="h-4 w-4" />
                        {f.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="space-y-1">
                <label htmlFor="verify-notes" className="text-xs font-medium text-zinc-700">
                  What&apos;s wrong? (optional)
                </label>
                <textarea
                  id="verify-notes"
                  rows={3}
                  maxLength={2000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Owner was on the About page of the hotel website"
                  className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={() => setConfirming(true)}
                disabled={fields.length === 0}
                className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
              >
                Save review
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setConfirming(false)}>
          <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-zinc-900">Did you fix all the errors?</h3>
            <p className="text-sm text-zinc-600">
              You flagged: <span className="font-medium text-zinc-900">{fields.map((f) => VERIFY_FIELD_LABELS[f]).join(", ")}</span>
            </p>
            <div className="space-y-2">
              <button
                onClick={() => save({ has_errors: true, fields, fixed_all: true, notes })}
                disabled={saving}
                className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Yes, all fixed &rarr; Verified
              </button>
              <button
                onClick={() => save({ has_errors: true, fields, fixed_all: false, notes })}
                disabled={saving}
                className="w-full rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                No, some are still missing &rarr; Qualified - Incomplete
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={saving}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

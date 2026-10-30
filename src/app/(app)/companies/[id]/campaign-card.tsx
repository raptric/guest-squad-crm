"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EnrollmentRow, Playbook } from "@/lib/campaigns";
import { CHANNEL_CHIP, DUE_TONE, ENROLLMENT_CHIP, dueInfo, formatDate } from "@/lib/campaigns-format";
import { MegaphoneIcon, PlusIcon } from "../../icons";
import { TaskActions } from "../../tasks/task-actions";
import { TaskEmail } from "../../tasks/task-email";
import { PlaybookPanel } from "../../campaigns/playbook-panel";
import { FIT_CHIP, FIT_TEXT, type Fit } from "@/lib/campaign-fit-format";

type CampaignOption = { id: string; name: string; description: string; steps: { day_number: number; channel: string; title: string }[]; fit: Fit | null };
type Recipient = { id: number; label: string };

const addDays = (start: string, n: number) => new Date(Date.parse(`${start}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// The company's campaign section: enroll (owner of a verified company), then work through the tasks.
export function CampaignCard({
  companyId,
  today,
  mayEnroll,
  enrollNote,
  canAct,
  senderName,
  senderEmail,
  signature,
  aiWriting,
  enrollments,
  playbooks,
  campaigns,
  recipients,
  lockedCampaignId,
  takenRecipients,
}: {
  companyId: number;
  today: string;
  mayEnroll: boolean;
  enrollNote: string | null;
  canAct: boolean;
  senderName: string;
  senderEmail: string | null;
  signature: string;
  aiWriting: boolean;
  enrollments: EnrollmentRow[];
  playbooks: Record<string, Playbook>;
  campaigns: CampaignOption[];
  recipients: Recipient[];
  lockedCampaignId: string | null;
  takenRecipients: string[];
}) {
  const [enrolling, setEnrolling] = useState(false);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-base font-semibold text-zinc-900">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
            <MegaphoneIcon className="h-5 w-5" />
          </span>
          Campaign
        </h2>
        {mayEnroll && (
          <button
            onClick={() => setEnrolling(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
          >
            <PlusIcon className="h-4 w-4" />
            {lockedCampaignId ? "Add recipient" : "Enroll"}
          </button>
        )}
      </div>

      {enrollments.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {mayEnroll ? "Not in a campaign yet. Enroll this company to create its tasks." : enrollNote ?? "Not in a campaign."}
        </p>
      ) : (
        <div className="space-y-5">
          {enrollments.map((e) => (
            <EnrollmentBlock key={e.id} enrollment={e} playbook={playbooks[e.campaign_id]} canAct={canAct} today={today} senderName={senderName} senderEmail={senderEmail} signature={signature} aiWriting={aiWriting} />
          ))}
          {!mayEnroll && enrollNote && <p className="text-xs text-zinc-500">{enrollNote}</p>}
        </div>
      )}

      {enrolling && (
        <EnrollDialog
          companyId={companyId}
          today={today}
          campaigns={campaigns}
          recipients={recipients}
          lockedCampaignId={lockedCampaignId}
          takenRecipients={takenRecipients}
          onClose={() => setEnrolling(false)}
        />
      )}
    </section>
  );
}

function EnrollmentBlock({ enrollment: e, playbook, canAct, today, senderName, senderEmail, signature, aiWriting }: { enrollment: EnrollmentRow; playbook: Playbook | undefined; canAct: boolean; today: string; senderName: string; senderEmail: string | null; signature: string; aiWriting: boolean }) {
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finished = e.tasks.filter((t) => t.status === "done" || t.status === "skipped").length;

  async function stop() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaign-enrollments/${e.id}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't stop the campaign");
      return;
    }
    setStopping(false);
    router.refresh();
  }

  return (
    <div className={`rounded-xl border p-4 ${e.status === "active" ? "border-zinc-200" : "border-zinc-100 bg-zinc-50/60"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-900">{e.campaign_name}</p>
          <p className="truncate text-xs text-zinc-500">For {e.recipient_label}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          {e.fit_label && <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${FIT_CHIP[e.fit_label]}`}>{FIT_TEXT[e.fit_label]}</span>}
          {e.status === "active" && e.campaign_status === "paused" && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Paused</span>}
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ENROLLMENT_CHIP[e.status]}`}>
            {e.status === "active" ? "Active" : e.status === "completed" ? "Completed" : "Stopped"}
          </span>
        </span>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {finished} of {e.tasks.length} steps finished · started {formatDate(e.start_date)}
        {e.enrolled_by_name ? ` · by ${e.enrolled_by_name}` : ""}
      </p>
      {e.status === "stopped" && (
        <p className="mt-1 text-xs text-zinc-500">
          Stopped{e.stopped_by_name ? ` by ${e.stopped_by_name}` : ""}
          {e.stop_note ? `: ${e.stop_note}` : "."}
        </p>
      )}

      {e.status === "active" && e.campaign_status === "paused" && (
        <p className="mt-1 text-xs text-amber-700">This campaign is paused, so its tasks are on hold. They move forward by the days paused when it resumes.</p>
      )}
      {playbook && e.status === "active" && (
        <div className="mt-3">
          <PlaybookPanel playbook={playbook} />
        </div>
      )}

      <ul className="mt-3 divide-y divide-zinc-100">
        {e.tasks.map((t) => {
          const due = dueInfo(t.due_date, today);
          const actable = canAct && e.status !== "stopped" && !(e.status === "active" && e.campaign_status === "paused");
          // A pending email step has its Done / Skip inside the email area, next to Send.
          const actionsInEmail = Boolean(t.mail) && t.status === "pending" && actable;
          return (
            <li key={t.id} className={`space-y-2 py-3 ${t.status === "cancelled" ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {t.status === "pending" ? (
                  <span className={`rounded-full px-2 py-0.5 font-medium ${DUE_TONE[due.tone]}`}>{due.text}</span>
                ) : (
                  <span className={`rounded-full px-2 py-0.5 font-medium ${t.status === "done" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-600"}`}>
                    {t.status === "done" ? "Done" : t.status === "skipped" ? "Skipped" : "Cancelled"}
                  </span>
                )}
                <span className="text-zinc-500">{formatDate(t.due_date)}</span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${CHANNEL_CHIP[t.step_channel] ?? CHANNEL_CHIP.Other}`}>{t.step_channel}</span>
              </div>
              <p className={`text-sm font-medium ${t.status === "cancelled" ? "text-zinc-500 line-through" : "text-zinc-900"}`}>
                Day {t.step_day}: {t.step_title}
              </p>
              {t.step_instructions && t.status === "pending" && (
                <details className="text-xs text-zinc-600">
                  <summary className="cursor-pointer font-medium text-zinc-500 hover:text-zinc-800">Instructions</summary>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2.5 leading-relaxed">{t.step_instructions}</p>
                </details>
              )}
              {(t.status === "done" || t.status === "skipped") && (
                <p className="text-xs text-zinc-500">
                  {t.completed_by_name ?? "Someone"}
                  {t.notes ? `: ${t.notes}` : ""}
                </p>
              )}
              {t.mail && <TaskEmail taskId={t.id} status={t.status} channel={t.step_channel} canAct={actable} mail={t.mail} senderName={senderName} senderEmail={senderEmail} signature={signature} aiWriting={aiWriting} />}
              {!actionsInEmail && <TaskActions taskId={t.id} status={t.status} channel={t.step_channel} canAct={actable} />}
            </li>
          );
        })}
      </ul>

      {canAct && e.status === "active" && (
        <div className="mt-2 border-t border-zinc-100 pt-3">
          {!stopping ? (
            <button onClick={() => setStopping(true)} className="text-xs text-zinc-500 underline hover:text-red-600">
              Stop this campaign
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                autoFocus
                rows={2}
                maxLength={2000}
                value={note}
                onChange={(ev) => setNote(ev.target.value)}
                placeholder="Why are you stopping? (optional) e.g. replied, not interested, wrong person"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex gap-2">
                <button onClick={stop} disabled={busy} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                  {busy ? "Stopping..." : "Stop campaign"}
                </button>
                <button onClick={() => setStopping(false)} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
                  Cancel
                </button>
              </div>
              <p className="text-xs text-zinc-500">The remaining tasks will be cancelled.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnrollDialog({
  companyId,
  today,
  campaigns,
  recipients,
  lockedCampaignId,
  takenRecipients,
  onClose,
}: {
  companyId: number;
  today: string;
  campaigns: CampaignOption[];
  recipients: Recipient[];
  lockedCampaignId: string | null;
  takenRecipients: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const options = lockedCampaignId ? campaigns.filter((c) => c.id === lockedCampaignId) : campaigns;
  const keys = [...recipients.map((r) => `contact:${r.id}`), "company"];
  const firstFree = keys.find((k) => !takenRecipients.includes(k));
  const freeContacts = recipients.map((r) => `contact:${r.id}`).filter((k) => !takenRecipients.includes(k));

  const [campaignId, setCampaignId] = useState(options[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>(firstFree ? [firstFree] : []);
  const toggle = (key: string) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const allContacts = freeContacts.length > 0 && freeContacts.every((k) => picked.includes(k));
  const toggleAll = () => setPicked((p) => (allContacts ? p.filter((k) => !freeContacts.includes(k)) : [...new Set([...p, ...freeContacts])]));
  const [start, setStart] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campaign = options.find((c) => c.id === campaignId);

  async function submit() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/campaigns/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        campaign_id: Number(campaignId),
        recipients: picked.map((k) => (k === "company" ? { type: "company" } : { type: "contact", contact_id: Number(k.split(":")[1]) })),
        start_date: start,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't enroll");
      return;
    }
    onClose();
    router.refresh();
  }

  const field = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && onClose()}>
      <div className="max-h-[90vh] w-full max-w-lg space-y-5 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-zinc-900">{lockedCampaignId ? "Add recipients" : "Enroll in a campaign"}</h2>

        {options.length === 0 ? (
          <p className="text-sm text-zinc-500">There are no active campaigns yet. An admin needs to create one first.</p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-zinc-700">Campaign</span>
              <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} disabled={!!lockedCampaignId} className={field}>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.fit?.label ? ` · ${FIT_TEXT[c.fit.label]}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {campaign?.fit?.label && (
              <div className={`space-y-1.5 rounded-xl p-3 text-sm ${campaign.fit.label === "weak" ? "bg-red-50" : campaign.fit.label === "partial" ? "bg-amber-50" : "bg-emerald-50"}`}>
                <p className="flex items-center gap-2 font-medium text-zinc-800">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${FIT_CHIP[campaign.fit.label]}`}>{FIT_TEXT[campaign.fit.label]}</span>
                  {campaign.fit.label === "weak" ? "This company doesn't match this campaign's target audience well." : "How this company matches the target audience:"}
                </p>
                <ul className="space-y-0.5 text-xs text-zinc-700">
                  {campaign.fit.lines.map((l, i) => (
                    <li key={i} className={l.result === "miss" ? "font-medium text-red-700" : l.result === "unknown" ? "text-zinc-500" : ""}>
                      {l.result === "match" ? "✓" : l.result === "miss" ? "✗" : "?"} {l.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {campaign && (
              <div className="space-y-2 rounded-xl bg-zinc-50 p-4 text-sm">
                {campaign.description && <p className="line-clamp-6 whitespace-pre-wrap text-zinc-600">{campaign.description}</p>}
                <ol className="space-y-1 text-xs text-zinc-600">
                  {campaign.steps.map((s, i) => (
                    <li key={i} className="flex items-baseline gap-2">
                      <span className="w-16 shrink-0 font-medium text-zinc-500">Day {s.day_number}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {s.title} <span className="text-zinc-400">({s.channel})</span>
                      </span>
                      <span className="shrink-0 text-zinc-400">{formatDate(addDays(start, s.day_number - 1))}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-zinc-700">Who is this for?</legend>
              {freeContacts.length > 1 && (
                <label className="flex cursor-pointer items-start gap-2 border-b border-zinc-100 pb-2 text-sm font-medium text-zinc-800">
                  <input type="checkbox" checked={allContacts} onChange={toggleAll} className="mt-1" />
                  <span>All contacts ({freeContacts.length}). Each one gets their own tasks.</span>
                </label>
              )}
              {recipients.map((r) => {
                const key = `contact:${r.id}`;
                const taken = takenRecipients.includes(key);
                return (
                  <label key={key} className={`flex items-start gap-2 text-sm ${taken ? "text-zinc-400" : "cursor-pointer text-zinc-700"}`}>
                    <input type="checkbox" disabled={taken} checked={picked.includes(key)} onChange={() => toggle(key)} className="mt-1" />
                    <span>
                      {r.label}
                      {taken && <span className="ml-2 text-xs">already in this campaign</span>}
                    </span>
                  </label>
                );
              })}
              <label className={`flex items-start gap-2 text-sm ${takenRecipients.includes("company") ? "text-zinc-400" : "cursor-pointer text-zinc-700"}`}>
                <input type="checkbox" disabled={takenRecipients.includes("company")} checked={picked.includes("company")} onChange={() => toggle("company")} className="mt-1" />
                <span>
                  The company&apos;s general email / phone
                  {takenRecipients.includes("company") && <span className="ml-2 text-xs">already in this campaign</span>}
                </span>
              </label>
              {recipients.length === 0 && <p className="text-xs text-zinc-500">This company has no contacts yet, so the general email / phone is the only option.</p>}
            </fieldset>

            <label className="block space-y-1">
              <span className="text-sm font-medium text-zinc-700">Start date (Day 1)</span>
              <input type="date" value={start} min={addDays(today, -1)} max={addDays(today, 90)} onChange={(e) => setStart(e.target.value)} className={field} />
            </label>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            Cancel
          </button>
          {options.length > 0 && (
            <button
              onClick={submit}
              disabled={saving || !campaignId || picked.length === 0 || !start}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-40"
            >
              {saving ? "Enrolling..." : `${campaign?.fit?.label === "weak" ? "Enroll anyway" : "Enroll"}${picked.length > 1 ? ` ${picked.length} recipients` : ""} (${(campaign?.steps.length ?? 0) * Math.max(picked.length, 1)} tasks)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

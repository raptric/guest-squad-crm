"use client";

import { useEffect, useRef, useState } from "react";
import { asTag } from "@/lib/ai/codes-format";
import type { PreviewCampaign } from "./prompts-workspace";

const field = "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-60";

type Company = { id: number; name: string; company_type: string };
type Contact = { id: string; name: string; job_title: string | null };
type Result = { text: string; chars: number; tokens: number; empty: string[]; unknown: string[]; notes: string[] };

// Fills the prompt, as it is in the editor, with a real campaign step (and company) and shows what the AI would be given.
// Nothing is sent to an AI service.
export function PreviewPanel({ promptKey, group, text, campaigns }: { promptKey: string; group: "campaign" | "company"; text: string; campaigns: PreviewCampaign[] }) {
  const isCompany = group === "company";
  const wantedChannel = promptKey.includes("initial") ? "Initial Email" : "Follow-up Email";

  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const campaign = campaigns.find((c) => c.id === campaignId);
  const defaultStep = (c: PreviewCampaign | undefined) => String((c?.steps.find((s) => s.channel === wantedChannel) ?? c?.steps[0])?.number ?? "");
  const [stepNumber, setStepNumber] = useState(defaultStep(campaigns[0]));

  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Company[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contact, setContact] = useState("company");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!isCompany || !open || company) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/companies/search?all=1&q=${encodeURIComponent(search)}`);
      if (res.ok) setFound(((await res.json()) as { companies: Company[] }).companies);
    }, 250);
    return () => clearTimeout(timer.current);
  }, [search, isCompany, open, company]);

  async function pickCompany(c: Company) {
    setCompany(c);
    setFound([]);
    setContacts([]);
    setContact("company");
    const res = await fetch(`/api/admin/ai/preview/contacts?company_id=${c.id}`);
    if (res.ok) {
      const list = ((await res.json()) as { contacts: Contact[] }).contacts;
      setContacts(list);
      if (list[0]) setContact(list[0].id);
    }
  }

  async function fill() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/ai/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: promptKey, text, campaign_id: campaignId, step_number: Number(stepNumber), company_id: company?.id, contact: isCompany ? contact : undefined }),
    });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as Result & { error?: string };
    if (!res.ok) {
      setResult(null);
      setError(data.error ?? "Couldn't fill the prompt");
      return;
    }
    setResult(data);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-sky-700 hover:underline">
        Preview with real data
      </button>
    );
  }

  const ready = Boolean(campaignId && stepNumber && (!isCompany || company));

  return (
    <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/40 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-900">Preview with real data</h4>
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-800">
          Close
        </button>
      </div>
      <p className="text-xs text-zinc-500">Fills in the text above, even if it is not saved, and shows what the AI would be given. Nothing is sent to an AI service.</p>

      {campaigns.length === 0 ? (
        <p className="text-sm text-zinc-600">There are no campaigns yet. Create one to preview with.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-zinc-600">
            Campaign
            <select
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setStepNumber(defaultStep(campaigns.find((c) => c.id === e.target.value)));
                setResult(null);
              }}
              className={field}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name} ({c.status})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-zinc-600">
            Step
            <select value={stepNumber} onChange={(e) => setStepNumber(e.target.value)} className={field}>
              {(campaign?.steps ?? []).map((s) => (
                <option key={s.number} value={s.number}>
                  {s.number} · {s.channel} · day {s.day} — {s.title}
                </option>
              ))}
            </select>
          </label>

          {isCompany && (
            <>
              <div className="space-y-1 text-xs font-medium text-zinc-600">
                Company
                {company ? (
                  <div className="flex items-center justify-between rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800">
                    <span className="truncate">
                      {company.name} <span className="text-xs text-zinc-400">{company.company_type}</span>
                    </span>
                    <button
                      onClick={() => {
                        setCompany(null);
                        setContacts([]);
                        setResult(null);
                      }}
                      className="ml-2 shrink-0 text-xs text-sky-700 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a company by name" className={field} />
                    {found.length > 0 && (
                      <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-zinc-200 bg-white shadow-lg">
                        {found.map((c) => (
                          <li key={c.id}>
                            <button onClick={() => pickCompany(c)} className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-zinc-50">
                              {c.name}
                              <span className="text-xs text-zinc-400">{c.company_type}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <label className="space-y-1 text-xs font-medium text-zinc-600">
                Contact
                <select value={contact} onChange={(e) => setContact(e.target.value)} disabled={!company} className={field}>
                  <option value="company">General company contact (no named person)</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.job_title ? ` · ${c.job_title}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
      )}

      <button onClick={fill} disabled={busy || !ready} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
        {busy ? "Filling…" : "Fill the prompt"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
            <span>
              About {result.tokens.toLocaleString()} tokens · {result.chars.toLocaleString()} characters
            </span>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(result.text).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="text-sky-700 hover:underline"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {result.unknown.length > 0 && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">
              Not short codes, left as they are: {result.unknown.map((c) => asTag(c)).join(", ")}
            </p>
          )}
          {result.empty.length > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              These codes had nothing to insert for this example: <span className="font-mono">{result.empty.map((c) => asTag(c)).join(", ")}</span>
            </p>
          )}
          {result.notes.map((n) => (
            <p key={n} className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {n}
            </p>
          ))}
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-white p-3 font-mono text-xs leading-relaxed text-zinc-800">{result.text}</pre>
          <p className="text-xs text-zinc-500">The CRM adds the reply format and the &quot;use only the facts given&quot; rule after this text when it sends the prompt.</p>
        </div>
      )}
    </div>
  );
}

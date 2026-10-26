"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineStatus } from "@/lib/pipeline-format";
import { allowedLabel, type EnrollmentRule } from "@/lib/campaign-rule-format";

const select = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-50";
const ANY = "any";

// Settings -> Rules: who can be enrolled in a campaign. Verified or not, and which status / stage combinations are allowed
// (empty list = any stage). Only the company's owner can enroll; that is not a setting.
export function CampaignRuleBlock({ statuses, rule }: { statuses: PipelineStatus[]; rule: EnrollmentRule }) {
  const router = useRouter();
  const activeStatuses = statuses.filter((s) => s.is_active);
  const [statusId, setStatusId] = useState(activeStatuses[0]?.id ?? "");
  const [stageId, setStageId] = useState(ANY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stageOptions = (statuses.find((s) => s.id === statusId)?.stages ?? []).filter((g) => g.is_active);

  async function save(body: Record<string, unknown>): Promise<boolean> {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/campaign-rule", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save");
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 p-4 text-sm">
      <p className="font-medium text-zinc-800">Companies can be enrolled in a campaign when:</p>

      <label className="flex items-center gap-2 text-zinc-700">
        <input type="checkbox" checked={rule.require_verified} disabled={saving} onChange={(e) => save({ require_verified: e.target.checked })} />
        they are verified
      </label>

      <div className="space-y-2">
        <p className="text-zinc-700">
          their status and stage is one of these <span className="text-xs text-zinc-400">(empty = any stage)</span>:
        </p>
        <div className="flex flex-wrap gap-2">
          {rule.allowed.map((e) => (
            <span key={e.id} className={`inline-flex items-center gap-1.5 rounded-full py-1 pl-3 pr-2 text-xs font-medium ${e.active ? "bg-sky-50 text-sky-800" : "bg-zinc-100 text-zinc-400 line-through"}`}>
              {allowedLabel(e)}
              {!e.active && <span className="no-underline">(switched off)</span>}
              <button type="button" disabled={saving} aria-label={`Remove ${allowedLabel(e)}`} onClick={() => save({ remove: e.id })} className="grid h-4 w-4 place-items-center rounded-full hover:bg-sky-200 disabled:opacity-50">
                ×
              </button>
            </span>
          ))}
          {rule.allowed.length === 0 && <span className="text-xs text-zinc-500">None added: companies in any status and stage are allowed.</span>}
        </div>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await save({ add: { status_id: statusId, stage_id: stageId === ANY ? null : stageId } });
          }}
        >
          <span className="text-xs text-zinc-500">Add:</span>
          <select
            aria-label="Status"
            value={statusId}
            disabled={saving}
            onChange={(e) => {
              setStatusId(e.target.value);
              setStageId(ANY);
            }}
            className={select}
          >
            {activeStatuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select aria-label="Stage" value={stageId} disabled={saving} onChange={(e) => setStageId(e.target.value)} className={select}>
            <option value={ANY}>Any stage</option>
            {stageOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={saving || !statusId} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            Add
          </button>
          {saving && <span className="text-xs text-zinc-400">Saving...</span>}
        </form>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-zinc-500">Only the company&apos;s owner can enroll it. Companies already in a campaign keep their tasks and history either way.</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineStatus } from "@/lib/pipeline-format";

export type VerifiedRule = { status_id: string; stage_id: string; is_enabled: boolean };

const select = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-50";

// The one pipeline rule so far: what happens to a company when it is verified.
export function RulesSettings({ statuses, rule }: { statuses: PipelineStatus[]; rule: VerifiedRule }) {
  const router = useRouter();
  const [statusId, setStatusId] = useState(rule.status_id);
  const [stageId, setStageId] = useState(rule.stage_id);
  const [enabled, setEnabled] = useState(rule.is_enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Switched-off values can't be newly picked, but the current target stays visible.
  const statusOptions = statuses.filter((s) => s.is_active || s.id === rule.status_id);
  const stageOptions = (statuses.find((s) => s.id === statusId)?.stages ?? []).filter((g) => g.is_active || g.id === rule.stage_id);

  async function save(body: Record<string, unknown>, revert: () => void) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/pipeline-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule: "on_verified", ...body }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save");
      revert();
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-6">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Rules</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Runs only when a company is <strong>verified</strong> (no errors, or all errors fixed). It never moves a company backwards: if the company is already at or past this
          point in the pipeline, nothing changes. &quot;Qualified - Incomplete&quot; moves nothing.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 p-4 text-sm">
        <label className="flex items-center gap-2 font-medium text-zinc-800">
          <input
            type="checkbox"
            checked={enabled}
            disabled={saving}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(next);
              save({ is_enabled: next }, () => setEnabled(!next));
            }}
          />
          When a company is verified, move it to
        </label>
        <select
          aria-label="Status"
          value={statusId}
          disabled={saving}
          onChange={(e) => {
            const nextStatus = e.target.value;
            const firstStage = statuses.find((s) => s.id === nextStatus)?.stages.find((g) => g.is_active)?.id ?? "";
            const prev = { statusId, stageId };
            setStatusId(nextStatus);
            setStageId(firstStage);
            save({ status_id: nextStatus, stage_id: firstStage }, () => {
              setStatusId(prev.statusId);
              setStageId(prev.stageId);
            });
          }}
          className={select}
        >
          {statusOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-zinc-400">/</span>
        <select
          aria-label="Stage"
          value={stageId}
          disabled={saving}
          onChange={(e) => {
            const prev = stageId;
            setStageId(e.target.value);
            save({ status_id: statusId, stage_id: e.target.value }, () => setStageId(prev));
          }}
          className={select}
        >
          {stageOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {saving && <span className="text-xs text-zinc-400">Saving...</span>}
        {saved && !saving && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}

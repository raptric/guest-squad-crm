"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { statusChip, type PipelineStatus } from "@/lib/pipeline-format";

type Current = { statusId: string | null; stageId: string | null; statusName: string | null; stageName: string | null; color: string | null };

// Status + Stage of a company. Status is the main head; the Stage list only shows the stages of the chosen status.
// Changing the status moves the company to that status's first stage (change the stage right after if needed).
// People who may not change it just see the two chips.
export function PipelineEditor({ companyId, statuses, current, canEdit }: { companyId: number; statuses: PipelineStatus[]; current: Current; canEdit: boolean }) {
  // Remount when the saved value changes on the server so the selects always show what is stored.
  return <PipelineEditorInner key={`${current.statusId}:${current.stageId}`} companyId={companyId} statuses={statuses} current={current} canEdit={canEdit} />;
}

function PipelineEditorInner({ companyId, statuses, current, canEdit }: { companyId: number; statuses: PipelineStatus[]; current: Current; canEdit: boolean }) {
  const router = useRouter();
  const [statusId, setStatusId] = useState(current.statusId ?? "");
  const [stageId, setStageId] = useState(current.stageId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!current.statusName) return <span className="text-xs text-zinc-400">No status</span>;
  const chip = statusChip(current.color);

  if (!canEdit) {
    return (
      <>
        <span className={`rounded-full px-2.5 py-1 font-medium ${chip}`}>{current.statusName}</span>
        {current.stageName && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-zinc-700">{current.stageName}</span>}
      </>
    );
  }

  // Active statuses, plus the one the company is on even if it has since been switched off.
  const statusOptions = statuses.filter((s) => s.is_active || s.id === current.statusId);
  const chosen = statuses.find((s) => s.id === statusId);
  const stageOptions = (chosen?.stages ?? []).filter((g) => g.is_active || g.id === current.stageId);

  async function save(nextStatus: string, nextStage: string | null) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/pipeline`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status_id: nextStatus, stage_id: nextStage }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save");
      setStatusId(current.statusId ?? "");
      setStageId(current.stageId ?? "");
      return;
    }
    router.refresh();
  }

  const selectCls = "cursor-pointer rounded-full border-0 py-1 pl-2.5 pr-6 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-300 disabled:opacity-60";
  return (
    <>
      <select
        aria-label="Status"
        value={statusId}
        disabled={saving}
        onChange={(e) => {
          setStatusId(e.target.value);
          setStageId(statuses.find((s) => s.id === e.target.value)?.stages.find((g) => g.is_active)?.id ?? "");
          save(e.target.value, null);
        }}
        className={`${selectCls} ${statusChip(statuses.find((s) => s.id === statusId)?.color)}`}
      >
        {statusOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Stage"
        value={stageId}
        disabled={saving}
        onChange={(e) => {
          setStageId(e.target.value);
          save(statusId, e.target.value);
        }}
        className={`${selectCls} bg-zinc-100 text-zinc-700`}
      >
        {stageId === "" && <option value="">…</option>}
        {stageOptions.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {saving && <span className="text-zinc-400">Saving...</span>}
      {error && <span className="basis-full text-red-600">{error}</span>}
    </>
  );
}

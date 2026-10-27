"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PipelineStatus } from "@/lib/pipeline-format";

export type ScraperRule = { status_id: string; stage_id: string; property_type: string | null };

const select = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-50";

// Settings -> Rules: what companies created by the scraper (gscraper) start as. Applies only to the scraper's import.
export function ScraperRuleBlock({ statuses, rule, propertyTypes }: { statuses: PipelineStatus[]; rule: ScraperRule; propertyTypes: string[] }) {
  const router = useRouter();
  const [statusId, setStatusId] = useState(rule.status_id);
  const [stageId, setStageId] = useState(rule.stage_id);
  const [propertyType, setPropertyType] = useState(rule.property_type ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Switched-off values can't be newly picked, but the current target stays visible.
  const statusOptions = statuses.filter((s) => s.is_active || s.id === rule.status_id);
  const stageOptions = (statuses.find((s) => s.id === statusId)?.stages ?? []).filter((g) => g.is_active || g.id === rule.stage_id);
  // A saved default that has since left the Property Type list stays visible so it isn't silently dropped from the dropdown.
  const typeOptions = rule.property_type && !propertyTypes.includes(rule.property_type) ? [rule.property_type, ...propertyTypes] : propertyTypes;

  async function save(body: Record<string, unknown>, revert: () => void) {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch("/api/admin/pipeline-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule: "on_scraped", ...body }),
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
    <div className="space-y-3 rounded-xl border border-zinc-200 p-4 text-sm">
      <p className="font-medium text-zinc-800">Companies added by the scraper (gscraper)</p>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-zinc-700">Start at</span>
        <select
          aria-label="Scraper start status"
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
          aria-label="Scraper start stage"
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
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-zinc-700">Default property type</span>
        <select
          aria-label="Default property type"
          value={propertyType}
          disabled={saving}
          onChange={(e) => {
            const prev = propertyType;
            setPropertyType(e.target.value);
            save({ property_type: e.target.value || null }, () => setPropertyType(prev));
          }}
          className={select}
        >
          <option value="">None</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {saving && <span className="text-xs text-zinc-400">Saving...</span>}
        {saved && !saving && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-zinc-500">
        The scraper can&apos;t set a status or stage: everything it adds starts here. The default property type is used only when a scraped record sends no property type, or one that isn&apos;t on the
        Property Type list. Leave it as None if one campaign mixes property types. Companies added by hand or by the research agent aren&apos;t affected.
      </p>
    </div>
  );
}

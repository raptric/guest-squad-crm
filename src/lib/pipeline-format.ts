// Client-safe bits of the pipeline (no server imports), shared by Settings, the company page and the Companies list.
export type PipelineStage = { id: string; name: string; sort_order: number; is_active: boolean; companies?: number };
export type PipelineStatus = { id: string; name: string; color: string; sort_order: number; is_active: boolean; companies?: number; stages: PipelineStage[] };

// Colours an admin can give a status. Full class names so Tailwind picks them up.
export const STATUS_COLORS: Record<string, { label: string; chip: string; dot: string }> = {
  sky: { label: "Blue", chip: "bg-sky-100 text-sky-800", dot: "bg-sky-500" },
  emerald: { label: "Green", chip: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
  teal: { label: "Teal", chip: "bg-teal-100 text-teal-800", dot: "bg-teal-500" },
  violet: { label: "Purple", chip: "bg-violet-100 text-violet-800", dot: "bg-violet-500" },
  amber: { label: "Yellow", chip: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  orange: { label: "Orange", chip: "bg-orange-100 text-orange-800", dot: "bg-orange-500" },
  rose: { label: "Red", chip: "bg-rose-100 text-rose-800", dot: "bg-rose-500" },
  zinc: { label: "Grey", chip: "bg-zinc-200 text-zinc-700", dot: "bg-zinc-400" },
};
export const statusChip = (color: string | null | undefined) => (STATUS_COLORS[color ?? ""] ?? STATUS_COLORS.zinc).chip;

// Shared (server + client) look and wording for campaign statuses, used by the table and the legend.
export type BatchState = "receiving" | "active" | "stale" | "completed";

export type Tone = { label: string; badge: string; dot: string; card: string };

export const STATE_TONE: Record<BatchState, Tone> = {
  receiving: { label: "Receiving", badge: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500", card: "border-emerald-200 bg-emerald-50/60" },
  active: { label: "Active", badge: "bg-sky-100 text-sky-800", dot: "bg-sky-500", card: "border-sky-200 bg-sky-50/60" },
  stale: { label: "Stale", badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500", card: "border-amber-200 bg-amber-50/60" },
  completed: { label: "Completed", badge: "bg-slate-200 text-slate-700", dot: "bg-slate-500", card: "border-slate-200 bg-slate-50" },
};

export const BACKFILL_TONE: Tone = {
  label: "Backfill",
  badge: "bg-violet-100 text-violet-800",
  dot: "bg-violet-500",
  card: "border-violet-200 bg-violet-50/60",
};

export const LEGEND: { tone: Tone; text: string }[] = [
  { tone: STATE_TONE.receiving, text: "Data arrived in the last 15 minutes." },
  { tone: STATE_TONE.active, text: "Data arrived in the last 24 hours." },
  { tone: STATE_TONE.stale, text: "Open campaign with nothing received for 24 hours." },
  { tone: STATE_TONE.completed, text: "Closed by the scraper's last-record flag, or by an admin. Permanent." },
  { tone: BACKFILL_TONE, text: "Existing companies grouped into a campaign after the fact." },
];

export const LEAD_STATUS_BADGE: Record<string, string> = {
  New: "bg-sky-100 text-sky-800",
  Qualified: "bg-emerald-100 text-emerald-800",
  "Needs Review": "bg-amber-100 text-amber-800",
  DisQualified: "bg-slate-200 text-slate-600",
};

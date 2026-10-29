// Display helpers for campaign tasks (safe for server and client code).
// What a step is about. Only a label: nothing is sent or integrated, the person does the step themselves.
export const CHANNELS = ["Initial Email", "Follow-up Email", "Call", "LinkedIn connection", "LinkedIn message", "WhatsApp / SMS", "Other"] as const;

const DAY_MS = 86_400_000;
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);

export const todayUtc = () => new Date().toISOString().slice(0, 10);

const SHORT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const formatDate = (d: string) => SHORT.format(new Date(parse(d)));

// "Overdue by 2 days" / "Due today" / "Due tomorrow" / "In 5 days" -- with a colour tone.
export function dueInfo(due: string, today: string): { text: string; tone: "overdue" | "today" | "soon" | "later" } {
  const diff = Math.round((parse(due) - parse(today)) / DAY_MS);
  if (diff < 0) return { text: `Overdue by ${-diff} ${diff === -1 ? "day" : "days"}`, tone: "overdue" };
  if (diff === 0) return { text: "Due today", tone: "today" };
  if (diff === 1) return { text: "Due tomorrow", tone: "soon" };
  return { text: `In ${diff} days`, tone: "later" };
}

export const DUE_TONE: Record<string, string> = {
  overdue: "bg-red-100 text-red-800",
  today: "bg-amber-100 text-amber-800",
  soon: "bg-sky-100 text-sky-800",
  later: "bg-zinc-100 text-zinc-600",
};

export const CHANNEL_CHIP: Record<string, string> = {
  "Initial Email": "bg-sky-50 text-sky-700",
  "Follow-up Email": "bg-cyan-50 text-cyan-700",
  Call: "bg-emerald-50 text-emerald-700",
  "LinkedIn connection": "bg-indigo-50 text-indigo-700",
  "LinkedIn message": "bg-indigo-50 text-indigo-700",
  "WhatsApp / SMS": "bg-green-50 text-green-700",
  Other: "bg-zinc-100 text-zinc-600",
};

export const ENROLLMENT_CHIP: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  completed: "bg-sky-100 text-sky-800",
  stopped: "bg-zinc-200 text-zinc-600",
};

export type Visibility = "private" | "team" | "public";
export const VISIBILITY_LABEL: Record<string, string> = { private: "Private", team: "Team", public: "Public" };
export const VISIBILITY_CHIP: Record<string, string> = { private: "bg-zinc-100 text-zinc-600", team: "bg-violet-100 text-violet-800", public: "bg-sky-100 text-sky-800" };
export const CAMPAIGN_STATUS_LABEL: Record<string, string> = { draft: "Draft", active: "Active", paused: "Paused", completed: "Completed" };
export const CAMPAIGN_STATUS_CHIP: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-800",
  completed: "bg-sky-100 text-sky-800",
};

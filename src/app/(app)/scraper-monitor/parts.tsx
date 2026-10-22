import { BACKFILL_TONE, STATE_TONE, type BatchState, type Tone } from "./status";

export function Pill({ tone, children }: { tone: Tone; children?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {children ?? tone.label}
    </span>
  );
}

export const StatusPill = ({ state }: { state: BatchState }) => <Pill tone={STATE_TONE[state]} />;
export const BackfillPill = () => <Pill tone={BACKFILL_TONE} />;

// Thin progress bar with a label and percentage -- "how complete is this data".
export function Meter({ label, value }: { label: string; value: number | null }) {
  const tone = value === null ? "bg-slate-200" : value >= 80 ? "bg-emerald-500" : value >= 40 ? "bg-sky-500" : "bg-amber-500";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-slate-500">{label}</span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${value ?? 0}%` }} />
      </span>
      <span className="w-9 text-right tabular-nums text-slate-600">{value === null ? "-" : `${value}%`}</span>
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

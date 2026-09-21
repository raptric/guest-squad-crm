import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { DashboardFilters, type FilterOptions } from "./dashboard-filters";

export const dynamic = "force-dynamic";

type Filters = { country?: string; state?: string; city?: string; status?: string; type?: string };
type Row = {
  group_value: string;
  n_total: number;
  n_properties: number;
  n_portfolios: number;
  n_independent: number;
  n_pending: number;
  n_needs_review: number;
  n_qualified: number;
  n_disqualified: number;
  n_stage1: number;
  n_stage2: number;
  n_stage3: number;
  n_stage4: number;
  n_q_with_contact: number;
  n_q_with_dm: number;
  n_q_ready: number;
};

const GROUPS = [
  { key: "country", label: "Country" },
  { key: "state", label: "State" },
  { key: "city", label: "City" },
  { key: "status", label: "Status" },
  { key: "type", label: "Type" },
] as const;

// Drilling into a row narrows the filter for that dimension and moves to the next-finer one.
const NEXT_GROUP: Record<string, string> = { country: "state", state: "city", city: "status", status: "status", type: "type" };

const EMPTY: Row = {
  group_value: "All", n_total: 0, n_properties: 0, n_portfolios: 0, n_independent: 0, n_pending: 0,
  n_needs_review: 0, n_qualified: 0, n_disqualified: 0, n_stage1: 0, n_stage2: 0, n_stage3: 0,
  n_stage4: 0, n_q_with_contact: 0, n_q_with_dm: 0, n_q_ready: 0,
};

const n = (v: unknown) => Number(v) || 0;
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const filters: Filters = {
    country: params.country || undefined,
    state: params.state || undefined,
    city: params.city || undefined,
    status: params.status || undefined,
    type: params.type || undefined,
  };
  const group = GROUPS.some((g) => g.key === params.group) ? params.group! : "country";

  const summary = async (f: Filters, groupBy: string): Promise<Row[]> => {
    const { data } = await supabase.rpc("dashboard_summary", {
      p_country: f.country ?? null,
      p_state: f.state ?? null,
      p_city: f.city ?? null,
      p_status: f.status ?? null,
      p_type: f.type ?? null,
      p_group_by: groupBy,
    });
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      group_value: String(r.group_value),
      ...Object.fromEntries(Object.entries(r).filter(([k]) => k !== "group_value").map(([k, v]) => [k, n(v)])),
    })) as Row[];
  };

  // Each filter's options respect the broader filters chosen before it.
  const optionsFor = async (groupBy: string, f: Filters) => (await summary(f, groupBy)).map((r) => r.group_value);
  const [totals, rows, country, state, city, status, type] = await Promise.all([
    summary(filters, "none"),
    summary(filters, group),
    optionsFor("country", {}),
    optionsFor("state", { country: filters.country }),
    optionsFor("city", { country: filters.country, state: filters.state }),
    optionsFor("status", { country: filters.country, state: filters.state, city: filters.city }),
    optionsFor("type", { country: filters.country, state: filters.state, city: filters.city }),
  ]);
  const options: FilterOptions = { country, state, city, status, type };
  const t = totals[0] ?? EMPTY;

  const qs = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, group, ...overrides })) if (v) next.set(k, v);
    return `/?${next.toString()}`;
  };

  const funnel = [
    { label: "Imported", value: t.n_total, note: "All companies in the system" },
    { label: "Researched", value: t.n_total - t.n_pending, note: "Status is past New" },
    { label: "Qualified", value: t.n_qualified, note: "Lead status Qualified" },
    { label: "Contact found", value: t.n_q_with_contact, note: "Qualified, with at least one contact" },
    { label: "Decision-maker identified", value: t.n_q_with_dm, note: "Qualified, a Primary Decision Maker recorded" },
    { label: "Outreach-ready", value: t.n_q_ready, note: "Qualified, verified decision-maker with a verified email or phone" },
  ];

  const ladder = [
    { label: "No contact", value: t.n_stage1, color: "bg-blue-100" },
    { label: "Contact, no decision-maker", value: t.n_stage2, color: "bg-blue-300" },
    { label: "Decision-maker, not yet verified", value: t.n_stage3, color: "bg-blue-500" },
    { label: "Outreach-ready", value: t.n_stage4, color: "bg-blue-700" },
  ];

  const tiles = [
    { label: "Companies", value: t.n_total },
    { label: "Properties", value: t.n_properties },
    { label: "Portfolios / groups", value: t.n_portfolios },
    { label: "Independent hotels", value: t.n_independent },
    { label: "Research pending", value: t.n_pending },
    { label: "Qualified", value: t.n_qualified },
  ];

  const listHref = (groupValue: string) => {
    if (groupValue === "(not set)" || group === "state") return null;
    const next = new URLSearchParams();
    const merged: Record<string, string | undefined> = { ...filters, [group]: groupValue };
    if (merged.country) next.set("country", merged.country);
    if (merged.city) next.set("city", merged.city);
    if (merged.status) next.set("lead_status", merged.status);
    if (merged.type) next.set("company_type", merged.type);
    return `/companies?${next.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500">
          {user?.name ? `Welcome, ${user.name}. ` : ""}What we have, how far it has progressed, and where the gaps are.
        </p>
      </div>

      <DashboardFilters options={options} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="text-2xl font-semibold tabular-nums text-zinc-900">{tile.value.toLocaleString()}</div>
            <div className="text-xs text-zinc-500">{tile.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Funnel</h2>
            <p className="text-xs text-zinc-500">
              How far leads get. Stages from Contact found on count qualified companies only.
            </p>
          </div>
          <ol className="space-y-3">
            {funnel.map((stage, i) => {
              const prev = i === 0 ? null : funnel[i - 1].value;
              return (
                <li key={stage.label} title={stage.note}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-zinc-900">{stage.label}</span>
                    <span className="tabular-nums text-zinc-900">
                      {stage.value.toLocaleString()}
                      <span className="ml-2 text-xs text-zinc-500">
                        {prev === null ? "" : `${pct(stage.value, prev)} of previous`}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-3 rounded-r bg-zinc-100">
                    <div
                      className="h-3 rounded-r bg-blue-600"
                      style={{ width: `${funnel[0].value ? (stage.value / funnel[0].value) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Contact readiness</h2>
            <p className="text-xs text-zinc-500">Can the sales team start outreach? Every company is in exactly one step.</p>
          </div>
          <div className="flex h-6 gap-0.5 overflow-hidden rounded">
            {ladder.map((step) =>
              step.value ? (
                <div
                  key={step.label}
                  className={step.color}
                  style={{ width: `${(step.value / (t.n_total || 1)) * 100}%` }}
                  title={`${step.label}: ${step.value}`}
                />
              ) : null
            )}
          </div>
          <ul className="space-y-2 text-sm">
            {ladder.map((step) => (
              <li key={step.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-zinc-700">
                  <span className={`inline-block h-3 w-3 rounded-sm ${step.color}`} />
                  {step.label}
                </span>
                <span className="tabular-nums text-zinc-900">
                  {step.value.toLocaleString()}
                  <span className="ml-2 text-xs text-zinc-500">{pct(step.value, t.n_total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Breakdown</h2>
            <p className="text-xs text-zinc-500">Click a name to filter to it.</p>
          </div>
          <div className="flex gap-1 text-sm">
            <span className="px-2 py-1 text-zinc-500">Group by</span>
            {GROUPS.map((g) => (
              <Link
                key={g.key}
                href={qs({ group: g.key })}
                className={`rounded-md px-3 py-1 ${
                  group === g.key ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {g.label}
              </Link>
            ))}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-zinc-500">
              <th className="py-2 pr-4 font-medium">{GROUPS.find((g) => g.key === group)?.label}</th>
              {["Total", "Properties", "Portfolios", "Independent", "Research pending", "Qualified", "No contact", "Outreach-ready"].map((h) => (
                <th key={h} className="py-2 pr-4 text-right font-medium">
                  {h}
                </th>
              ))}
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const href = listHref(r.group_value);
              const drillable = group !== "type" && group !== "status" ? true : false;
              const label = group === "status" && r.group_value === "New" ? "New (research pending)" : r.group_value;
              return (
                <tr key={r.group_value} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2 pr-4 font-medium text-zinc-900">
                    {r.group_value === "(not set)" ? (
                      <span className="text-zinc-500">{label}</span>
                    ) : (
                      <Link
                        href={qs({ [group]: r.group_value, group: drillable ? NEXT_GROUP[group] : group })}
                        className="hover:underline"
                      >
                        {label}
                      </Link>
                    )}
                  </td>
                  {[r.n_total, r.n_properties, r.n_portfolios, r.n_independent, r.n_pending, r.n_qualified, r.n_stage1, r.n_stage4].map(
                    (v, i) => (
                      <td key={i} className="py-2 pr-4 text-right tabular-nums text-zinc-700">
                        {v.toLocaleString()}
                      </td>
                    )
                  )}
                  <td className="py-2 text-right">
                    {href && (
                      <Link href={href} className="text-xs text-zinc-500 hover:text-zinc-700">
                        View companies
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-zinc-500">
                  No companies match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

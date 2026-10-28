import { query } from "@/lib/db";
import type { Actor } from "@/lib/assignment";
import { visibleSql } from "@/lib/visibility";
import { fetchEnrollmentRule } from "@/lib/campaign-rule";
import type { EnrollmentRule } from "@/lib/campaign-rule-format";
import { describeFit, type Criteria, type Fit, type FitLabel, type FitRow } from "@/lib/campaign-fit-format";

const READY = "Ready for Outreach";

// ---------------------------------------------------------------------------------------------------------------
// The one place that decides how well a company fits a campaign. Needs these aliases in the query:
//   k = the campaign's criteria (the campaigns table, or a one-row subquery with the same columns for the preview)
//   c = companies, pd = property_details
// Each criterion the campaign sets comes out as match / miss / unknown / na (property-only criteria on a company
// that isn't a property); criteria it doesn't set come out NULL. Label: 0 misses = strong, 1 = partial, 2+ = weak.
// A blank field is "unknown" and never counts as a miss.
// ---------------------------------------------------------------------------------------------------------------
export const IS_INDEPENDENT_SQL = "(c.parent_company_id IS NULL AND coalesce(pd.portfolio_role, 'Independent') = 'Independent')";

export const FIT_JOIN = `
  CROSS JOIN LATERAL (
    SELECT x.*,
           ((x.ct IS NOT DISTINCT FROM 'miss')::int + (x.pt IS NOT DISTINCT FROM 'miss')::int + (x.rooms IS NOT DISTINCT FROM 'miss')::int
             + (x.portfolio IS NOT DISTINCT FROM 'miss')::int + (x.location IS NOT DISTINCT FROM 'miss')::int) AS misses,
           ((x.ct IS NOT DISTINCT FROM 'unknown')::int + (x.pt IS NOT DISTINCT FROM 'unknown')::int + (x.rooms IS NOT DISTINCT FROM 'unknown')::int
             + (x.portfolio IS NOT DISTINCT FROM 'unknown')::int + (x.location IS NOT DISTINCT FROM 'unknown')::int) AS unknowns,
           (x.ct IS NOT NULL OR x.pt IS NOT NULL OR x.rooms IS NOT NULL OR x.portfolio IS NOT NULL OR x.location IS NOT NULL) AS has_criteria
      FROM (
        SELECT
          CASE WHEN cardinality(k.target_company_types) = 0 THEN NULL
               WHEN c.company_type = ANY(k.target_company_types) THEN 'match' ELSE 'miss' END AS ct,
          CASE WHEN cardinality(k.target_property_types) = 0 THEN NULL
               WHEN c.company_type <> 'Property' THEN 'na'
               WHEN pd.property_type IS NULL THEN 'unknown'
               WHEN pd.property_type = ANY(k.target_property_types) THEN 'match' ELSE 'miss' END AS pt,
          CASE WHEN k.rooms_min IS NULL AND k.rooms_max IS NULL THEN NULL
               WHEN c.company_type <> 'Property' THEN 'na'
               WHEN pd.rooms_units IS NULL THEN 'unknown'
               WHEN (k.rooms_min IS NULL OR pd.rooms_units >= k.rooms_min) AND (k.rooms_max IS NULL OR pd.rooms_units <= k.rooms_max) THEN 'match'
               ELSE 'miss' END AS rooms,
          CASE WHEN k.target_portfolio = 'any' THEN NULL
               WHEN c.company_type <> 'Property' THEN 'na'
               WHEN ${IS_INDEPENDENT_SQL} = (k.target_portfolio = 'independent') THEN 'match' ELSE 'miss' END AS portfolio,
          CASE WHEN cardinality(k.target_countries) = 0 THEN NULL
               WHEN c.country IS NULL THEN 'unknown'
               WHEN c.country = ANY(k.target_countries) THEN 'match' ELSE 'miss' END AS location
      ) x
  ) r`;

// Columns to select alongside FIT_JOIN: the results, the label, and the values the explanation quotes.
export const FIT_COLUMNS = `
  r.ct, r.pt, r.rooms, r.portfolio, r.location, r.misses, r.unknowns, r.has_criteria,
  CASE WHEN NOT r.has_criteria THEN NULL WHEN r.misses = 0 THEN 'strong' WHEN r.misses = 1 THEN 'partial' ELSE 'weak' END AS fit,
  c.company_type, pd.property_type, pd.rooms_units, ${IS_INDEPENDENT_SQL} AS is_independent, c.country,
  k.target_company_types, k.target_property_types, k.rooms_min, k.rooms_max, k.target_portfolio, k.target_countries`;

// A one-row stand-in for the campaigns table, for criteria that haven't been saved yet (the form's live preview).
export const criteriaSource = (firstParam: number) =>
  `(SELECT $${firstParam}::text[] AS target_company_types, $${firstParam + 1}::text[] AS target_property_types, $${firstParam + 2}::int AS rooms_min,
           $${firstParam + 3}::int AS rooms_max, $${firstParam + 4}::text AS target_portfolio, $${firstParam + 5}::text[] AS target_countries) k`;
export const criteriaParams = (c: Criteria) => [c.company_types, c.property_types, c.rooms_min, c.rooms_max, c.portfolio, c.countries];

// "Ready to enroll", from the same Settings rule the enroll route checks (checkEnrollable): verified? allowed
// status / stage combinations? Entries pointing at a switched-off status / stage are ignored, as there.
export function enrollableSql(rule: EnrollmentRule, add: (v: unknown) => string): string {
  const parts: string[] = [];
  if (rule.require_verified) parts.push(`c.verification_status = '${READY}'`);
  const live = rule.allowed.filter((e) => e.active);
  if (live.length > 0) {
    const ors = live.map((e) => `(c.pipeline_status_id = ${add(Number(e.status_id))}::bigint${e.stage_id ? ` AND c.pipeline_stage_id = ${add(Number(e.stage_id))}::bigint` : ""})`);
    parts.push(`(${ors.join(" OR ")})`);
  }
  return parts.length ? parts.join(" AND ") : "true";
}

// ---------------- one company, several campaigns (the Enroll box) ----------------
export async function fetchFitForCompany(companyId: number, campaignIds: (string | number)[]): Promise<Record<string, Fit>> {
  if (!campaignIds.length) return {};
  const rows = await query<FitRow & { campaign_id: string }>(
    `SELECT k.id::text AS campaign_id, ${FIT_COLUMNS}
       FROM campaigns k
      CROSS JOIN companies c
       LEFT JOIN property_details pd ON pd.company_id = c.id
      ${FIT_JOIN}
      WHERE c.id = $1 AND k.id = ANY($2::bigint[])`,
    [companyId, campaignIds.map(Number)]
  );
  return Object.fromEntries(rows.map((r) => [r.campaign_id, describeFit(r)]));
}

// ---------------- the form's live preview ----------------
export type FitCounts = { strong: number; partial: number; weak: number; total: number };

// How many companies this person could enroll right now, by fit for these (possibly unsaved) criteria.
export async function fetchFitCounts(actor: Actor, criteria: Criteria): Promise<FitCounts> {
  const rule = await fetchEnrollmentRule();
  const params: unknown[] = [...criteriaParams(criteria)];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const rows = await query<{ fit: FitLabel | null; n: number }>(
    `SELECT CASE WHEN NOT r.has_criteria THEN NULL WHEN r.misses = 0 THEN 'strong' WHEN r.misses = 1 THEN 'partial' ELSE 'weak' END AS fit, count(*)::int AS n
       FROM companies c
       LEFT JOIN property_details pd ON pd.company_id = c.id
      CROSS JOIN ${criteriaSource(1)}
      ${FIT_JOIN}
      WHERE c.deleted_at IS NULL AND ${visibleSql(actor, "c", add)} AND ${enrollableSql(rule, add)}
        AND NOT EXISTS (SELECT 1 FROM campaign_enrollments e WHERE e.company_id = c.id AND e.status = 'active')
      GROUP BY 1`,
    params
  );
  const n = (l: FitLabel) => rows.find((r) => r.fit === l)?.n ?? 0;
  const total = rows.reduce((s, r) => s + r.n, 0);
  return { strong: n("strong"), partial: n("partial"), weak: n("weak"), total };
}

// ---------------- the "Companies that fit" list ----------------
export type FitListRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  company_type: string;
  property_type: string | null;
  rooms_units: number | null;
  owner_id: string | null;
  owner_name: string | null;
  verified: boolean;
  enrollable: boolean;
  fit: FitLabel | null;
  misses: number;
  unknowns: number;
};
export type FitList = { rows: FitListRow[]; total: number; counts: FitCounts; hasCriteria: boolean };

export async function fetchFitList(
  actor: Actor,
  campaignId: number,
  opts: { includeUnverified: boolean; label: FitLabel | null; page: number; size: number }
): Promise<FitList> {
  const rule = await fetchEnrollmentRule();
  const params: unknown[] = [campaignId];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  // (only when used: a bound parameter that no placeholder refers to makes Postgres refuse the query)
  const enrollable = opts.includeUnverified ? "true" : enrollableSql(rule, add);
  const base = `
       FROM campaigns k
      CROSS JOIN companies c
       LEFT JOIN property_details pd ON pd.company_id = c.id
      ${FIT_JOIN}
       LEFT JOIN users ou ON ou.id = c.owner_id
      WHERE k.id = $1 AND c.deleted_at IS NULL AND ${visibleSql(actor, "c", add)}
        AND NOT EXISTS (SELECT 1 FROM campaign_enrollments e WHERE e.company_id = c.id AND e.status = 'active')
        ${opts.includeUnverified ? "" : `AND ${enrollable}`}`;
  const fitExpr = "CASE WHEN NOT r.has_criteria THEN NULL WHEN r.misses = 0 THEN 'strong' WHEN r.misses = 1 THEN 'partial' ELSE 'weak' END";

  const [countRows, hasCrit] = await Promise.all([
    query<{ fit: FitLabel | null; n: number }>(`SELECT ${fitExpr} AS fit, count(*)::int AS n ${base} GROUP BY 1`, params),
    query<{ has_criteria: boolean }>(
      `SELECT (cardinality(k.target_company_types) > 0 OR cardinality(k.target_property_types) > 0 OR k.rooms_min IS NOT NULL OR k.rooms_max IS NOT NULL
               OR k.target_portfolio <> 'any' OR cardinality(k.target_countries) > 0) AS has_criteria
         FROM campaigns k WHERE k.id = $1`,
      [campaignId]
    ),
  ]);
  const n = (l: FitLabel) => countRows.find((r) => r.fit === l)?.n ?? 0;
  const counts = { strong: n("strong"), partial: n("partial"), weak: n("weak"), total: countRows.reduce((s, r) => s + r.n, 0) };

  // Second query reuses the same parameters, then adds its own (the label filter, the page, a copy of the rule for the column).
  const listParams = [...params];
  const addList = (v: unknown) => {
    listParams.push(v);
    return `$${listParams.length}`;
  };
  const labelSql = opts.label ? ` AND ${fitExpr} = ${addList(opts.label)}` : "";
  const enrollableColumn = enrollableSql(rule, addList);
  const limitSql = `LIMIT ${addList(opts.size)} OFFSET ${addList((opts.page - 1) * opts.size)}`;
  const total = opts.label ? counts[opts.label] : counts.total;
  const rows = await query<FitListRow>(
    `SELECT c.id::text AS id, c.name, c.city, c.state, c.country, c.company_type, pd.property_type, pd.rooms_units, c.owner_id::text AS owner_id, ou.name AS owner_name,
            (c.verification_status = '${READY}') AS verified, (${enrollableColumn}) AS enrollable,
            ${fitExpr} AS fit, r.misses, r.unknowns
       ${base}${labelSql}
      ORDER BY CASE ${fitExpr} WHEN 'strong' THEN 0 WHEN 'partial' THEN 1 WHEN 'weak' THEN 2 ELSE 3 END, r.misses, r.unknowns, lower(c.name)
      ${limitSql}`,
    listParams
  );
  return { rows, total, counts, hasCriteria: hasCrit[0]?.has_criteria ?? false };
}

export type { Fit };

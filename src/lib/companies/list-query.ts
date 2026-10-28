import { query } from "@/lib/db";
import { fetchPipeline } from "@/lib/pipeline";
import { visibleSql } from "@/lib/visibility";
import type { Actor } from "@/lib/assignment";
import type { PipelineStatus } from "@/lib/pipeline-format";
import { NO_TIER, type Filters, type SortKey } from "./list-filters";

// Companies page data: one filtered, sorted, paged query plus a count and the option lists for the filters.
// Every value goes in as a bound parameter; sort columns come from a fixed whitelist.

export const FROM = `
  FROM companies c
  LEFT JOIN property_details pd ON pd.company_id = c.id
  LEFT JOIN pipeline_statuses ps ON ps.id = c.pipeline_status_id
  LEFT JOIN pipeline_stages pst ON pst.id = c.pipeline_stage_id
  LEFT JOIN users o ON o.id = c.owner_id
  LEFT JOIN teams t ON t.id = c.team_id
  LEFT JOIN companies par ON par.id = c.parent_company_id
  LEFT JOIN import_batches b ON b.id = c.import_batch_id
  LEFT JOIN LATERAL (
    SELECT rating, review_count FROM company_ratings
     WHERE company_id = c.id AND channel = 'google' ORDER BY captured_at DESC NULLS LAST LIMIT 1
  ) g ON true`;

const SORT_SQL: Record<SortKey, string> = {
  created: "c.created_at",
  name: "lower(c.name)",
  city: "lower(c.city)",
  tier: "c.prospect_tier",
  status: "(ps.sort_order * 1000 + pst.sort_order)",
  owner: "lower(o.name)",
  rating: "g.rating",
  rooms: "pd.rooms_units",
};

const HAS_CONTACT = `EXISTS (SELECT 1 FROM contact_companies cc JOIN contacts ct ON ct.id = cc.contact_id AND ct.deleted_at IS NULL WHERE cc.company_id = c.id)`;
const like = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;

// `actor` limits the result to the companies that person may see (see visibility.ts).
export function buildWhere(f: Filters, actor: Actor | null | undefined) {
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where: string[] = ["c.deleted_at IS NULL", visibleSql(actor, "c", add)];

  if (f.q) {
    const p = add(like(f.q));
    where.push(`(c.name ILIKE ${p} OR c.city ILIKE ${p} OR c.website ILIKE ${p} OR c.phone ILIKE ${p} OR c.email ILIKE ${p} OR c.address_line_1 ILIKE ${p})`);
  }
  if (f.status.length) where.push(`ps.name = ANY(${add(f.status)})`);
  if (f.stage.length) where.push(`c.pipeline_stage_id = ANY(${add(f.stage.filter((v) => /^\d+$/.test(v)).map(Number))})`);
  if (f.verification.length) {
    const p = add(f.verification);
    where.push(`(c.verification_status = ANY(${p}) OR (c.verification_status IS NULL AND 'Not verified' = ANY(${p})))`);
  }
  if (f.tier.length) {
    const p = add(f.tier);
    where.push(`(c.prospect_tier = ANY(${p}) OR (c.prospect_tier IS NULL AND '${NO_TIER}' = ANY(${p})))`);
  }
  if (f.country.length) where.push(`c.country = ANY(${add(f.country)})`);
  if (f.state.length) where.push(`c.state = ANY(${add(f.state)})`);
  if (f.city) where.push(`c.city ILIKE ${add(like(f.city))}`);
  if (f.ctype.length) where.push(`c.company_type = ANY(${add(f.ctype)})`);
  if (f.ptype.length) where.push(`pd.property_type = ANY(${add(f.ptype)})`);
  if (f.pclass.length) where.push(`pd.property_class = ANY(${add(f.pclass)})`);

  if (f.portfolio === "independent") {
    where.push(`c.company_type = 'Property' AND c.parent_company_id IS NULL AND coalesce(pd.portfolio_role, 'Independent') = 'Independent'`);
  } else if (f.portfolio === "portfolio") {
    where.push(`c.company_type = 'Property' AND (c.parent_company_id IS NOT NULL OR coalesce(pd.portfolio_role, 'Independent') <> 'Independent')`);
  } else if (f.portfolio === "groups") {
    where.push(`c.company_type <> 'Property'`);
  }
  if (f.group) where.push(`par.name ILIKE ${add(like(f.group))}`);

  if (f.owner.length) {
    const p = add(f.owner.filter((v) => /^\d+$/.test(v)).map(Number));
    where.push(f.owner.includes("unassigned") ? `(c.owner_id IS NULL OR c.owner_id = ANY(${p}))` : `c.owner_id = ANY(${p})`);
  }
  if (f.team.length) {
    const p = add(f.team.filter((v) => /^\d+$/.test(v)).map(Number));
    where.push(f.team.includes("none") ? `(c.team_id IS NULL OR c.team_id = ANY(${p}))` : `c.team_id = ANY(${p})`);
  }
  if (f.batch.length) {
    const p = add(f.batch.filter((v) => /^\d+$/.test(v)).map(Number));
    where.push(f.batch.includes("none") ? `(c.import_batch_id IS NULL OR c.import_batch_id = ANY(${p}))` : `c.import_batch_id = ANY(${p})`);
  }
  if (f.source.length) where.push(`c.source = ANY(${add(f.source)})`);

  const has = (col: string, v: string) => {
    if (v === "has") where.push(`(${col} IS NOT NULL AND ${col} <> '')`);
    if (v === "missing") where.push(`(${col} IS NULL OR ${col} = '')`);
  };
  has("c.website", f.website);
  has("c.phone", f.phone);
  has("c.email", f.email);
  // Contactless lives on the property profile: "yes" = ticked, "not_recorded" = everything else (including non-properties).
  if (f.contactless === "yes") where.push("pd.contactless IS TRUE");
  if (f.contactless === "not_recorded") where.push("pd.contactless IS NOT TRUE");
  if (f.contacts === "has") where.push(HAS_CONTACT);
  if (f.contacts === "missing") where.push(`NOT ${HAS_CONTACT}`);

  if (f.roomsMin) where.push(`pd.rooms_units >= ${add(Number(f.roomsMin))}`);
  if (f.roomsMax) where.push(`pd.rooms_units <= ${add(Number(f.roomsMax))}`);
  if (f.ratingMin) where.push(`g.rating >= ${add(Number(f.ratingMin))}`);
  if (f.addedFrom) where.push(`c.created_at >= ${add(f.addedFrom)}::date`);
  if (f.addedTo) where.push(`c.created_at < (${add(f.addedTo)}::date + 1)`);

  return { sql: where.join(" AND "), params };
}

export type CompanyRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  company_type: string;
  lead_status: string;
  status_name: string | null;
  status_color: string | null;
  stage_name: string | null;
  verification_status: string | null;
  prospect_tier: string | null;
  source: string | null;
  created_at: Date;
  owner_name: string | null;
  team_name: string | null;
  property_type: string | null;
  property_class: string | null;
  rooms_units: number | null;
  portfolio_role: string | null;
  parent_id: string | null;
  parent_name: string | null;
  campaign_name: string | null;
  google_rating: string | null;
  google_reviews: number | null;
  contacts: number;
};

export async function fetchCompanies(f: Filters, actor: Actor | null | undefined) {
  const { sql, params } = buildWhere(f, actor);
  const orderBy = `${SORT_SQL[f.sort]} ${f.dir === "asc" ? "ASC" : "DESC"} NULLS LAST, c.id DESC`;

  const [rows, [{ total }]] = await Promise.all([
    query<CompanyRow>(
      `SELECT c.id, c.name, c.city, c.state, c.country, c.company_type, c.lead_status, ps.name AS status_name, ps.color AS status_color, pst.name AS stage_name, c.verification_status,
              c.prospect_tier, c.source, c.created_at, o.name AS owner_name, t.name AS team_name,
              pd.property_type, pd.property_class, pd.rooms_units, pd.portfolio_role,
              par.id AS parent_id, par.name AS parent_name, b.campaign_name,
              g.rating AS google_rating, g.review_count AS google_reviews,
              (SELECT count(*)::int FROM contact_companies cc JOIN contacts ct ON ct.id = cc.contact_id AND ct.deleted_at IS NULL WHERE cc.company_id = c.id) AS contacts
       ${FROM}
       WHERE ${sql}
       ORDER BY ${orderBy}
       LIMIT ${f.size} OFFSET ${(f.page - 1) * f.size}`,
      params
    ),
    query<{ total: number }>(`SELECT count(*)::int AS total ${FROM} WHERE ${sql}`, params),
  ]);
  return { rows, total };
}

export type Option = { value: string; label: string; n?: number };
export type Facets = {
  pipeline: PipelineStatus[];
  countries: Option[];
  states: Option[];
  sources: Option[];
  owners: Option[];
  teams: Option[];
  batches: Option[];
  statuses: Option[];
  stages: Option[];
  tiers: string[];
  ptypes: string[];
  pclasses: string[];
  ctypes: string[];
};

// Option lists for the filter panel, in one round trip. Counts and choices only cover what the actor may see.
export async function fetchFacets(actor: Actor | null | undefined): Promise<Facets> {
  const pipeline = await fetchPipeline();
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const vis = visibleSql(actor, "c", add);
  const isAdmin = actor?.role === "super_admin";
  const ownerWhere = isAdmin ? "true" : actor?.role === "team_lead" && actor.team_id != null ? `team_id = ${add(actor.team_id)}::bigint` : actor ? `id = ${add(actor.id)}::bigint` : "false";
  const teamWhere = isAdmin ? "true" : actor?.team_id != null ? `id = ${add(actor.team_id)}::bigint` : "false";
  const [{ f }] = await query<{ f: Record<string, unknown> }>(`
    SELECT json_build_object(
      'countries', (SELECT coalesce(json_agg(json_build_object('value', v, 'label', v, 'n', n) ORDER BY n DESC), '[]'::json)
                      FROM (SELECT c.country v, count(*)::int n FROM companies c WHERE c.deleted_at IS NULL AND c.country IS NOT NULL AND ${vis} GROUP BY 1) x),
      'states', (SELECT coalesce(json_agg(json_build_object('value', v, 'label', v, 'n', n) ORDER BY v), '[]'::json)
                   FROM (SELECT c.state v, count(*)::int n FROM companies c WHERE c.deleted_at IS NULL AND c.state IS NOT NULL AND ${vis} GROUP BY 1) x),
      'sources', (SELECT coalesce(json_agg(json_build_object('value', v, 'label', v, 'n', n) ORDER BY n DESC), '[]'::json)
                    FROM (SELECT c.source v, count(*)::int n FROM companies c WHERE c.deleted_at IS NULL AND c.source IS NOT NULL AND ${vis} GROUP BY 1) x),
      'owners', (SELECT coalesce(json_agg(json_build_object('value', id::text, 'label', name) ORDER BY name), '[]'::json) FROM users WHERE ${ownerWhere}),
      'teams', (SELECT coalesce(json_agg(json_build_object('value', id::text, 'label', name) ORDER BY name), '[]'::json) FROM teams WHERE ${teamWhere}),
      'batches', (SELECT coalesce(json_agg(json_build_object('value', id::text, 'label', campaign_name) ORDER BY created_at DESC), '[]'::json) FROM import_batches),
      'picklists', (SELECT coalesce(json_object_agg(field_name, vals), '{}'::json)
                      FROM (SELECT field_name, json_agg(value ORDER BY sort_order, id) vals FROM picklist_values
                             WHERE is_active AND field_name IN ('prospect_tier','property_type','property_class','company_type')
                             GROUP BY field_name) p)
    ) AS f`, params);
  const pick = (f.picklists ?? {}) as Record<string, string[]>;
  return {
    pipeline,
    countries: f.countries as Option[],
    states: f.states as Option[],
    sources: f.sources as Option[],
    owners: f.owners as Option[],
    teams: f.teams as Option[],
    batches: f.batches as Option[],
    statuses: pipeline.map((s) => ({ value: s.name, label: s.name })),
    stages: pipeline.flatMap((s) => s.stages.map((g) => ({ value: g.id, label: `${s.name} › ${g.name}` }))),
    tiers: pick.prospect_tier ?? [],
    ptypes: pick.property_type ?? [],
    pclasses: pick.property_class ?? [],
    ctypes: pick.company_type ?? [],
  };
}

// How many companies sit in each status and stage under the current filters, ignoring the status / stage choice itself
// (so the chips can be switched between without the other counts going to zero). Keys are ids.
export async function fetchPipelineCounts(f: Filters, actor: Actor | null | undefined): Promise<{ status: Record<string, number>; stage: Record<string, number> }> {
  const { sql, params } = buildWhere({ ...f, status: [], stage: [] }, actor);
  const rows = await query<{ status_id: string | null; stage_id: string | null; n: number }>(
    `SELECT c.pipeline_status_id::text AS status_id, c.pipeline_stage_id::text AS stage_id, count(*)::int AS n ${FROM} WHERE ${sql} GROUP BY 1, 2`,
    params
  );
  const status: Record<string, number> = {};
  const stage: Record<string, number> = {};
  for (const r of rows) {
    if (r.status_id) status[r.status_id] = (status[r.status_id] ?? 0) + r.n;
    if (r.stage_id) stage[r.stage_id] = (stage[r.stage_id] ?? 0) + r.n;
  }
  return { status, stage };
}

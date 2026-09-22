import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client as PgClient } from "pg";
import { normalizeDomain } from "@/lib/companies/matching";

export type CandidateFacts = {
  name?: string | null;
  website?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  address?: string | null;
  parent_company_id?: number | null;
};

type CompanyRow = {
  id: number;
  name: string;
  website: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  address_line_1: string | null;
  company_type: string;
  parent_company_id: number | null;
};

export type Candidate = {
  company_id: number;
  name: string;
  website: string | null;
  city: string | null;
  country: string | null;
  company_type: string;
  parent_company_id: number | null;
  match_reasons: string[];
  match_confidence: "High" | "Medium" | "Low";
};

export const normalizeCompanyName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const normalizePhoneDigits = (phone: string) => phone.replace(/\D/g, "");
const normalizeAddress = (a: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Weighted, explainable scoring -- never a black-box ML match. A domain match is treated as a
// strong anchor on its own; a bare city/country match is treated as weak on its own (many
// hotels share a city), only useful to corroborate another signal.
function scoreCandidate(query: CandidateFacts, row: CompanyRow): Candidate | null {
  const reasons: string[] = [];
  let score = 0;

  if (query.website && row.website && normalizeDomain(query.website) === normalizeDomain(row.website)) {
    reasons.push("same official website");
    score += 5;
  }
  if (query.name && row.name && normalizeCompanyName(query.name) === normalizeCompanyName(row.name)) {
    reasons.push("same company name");
    score += 3;
  }
  if (query.phone && row.phone) {
    const a = normalizePhoneDigits(query.phone);
    const b = normalizePhoneDigits(row.phone);
    if (a && b && a === b) {
      reasons.push("same phone number");
      score += 3;
    }
  }
  if (query.address && row.address_line_1 && normalizeAddress(query.address) === normalizeAddress(row.address_line_1)) {
    reasons.push("same address");
    score += 3;
  }
  if (
    query.city &&
    row.city &&
    query.country &&
    row.country &&
    query.city.trim().toLowerCase() === row.city.trim().toLowerCase() &&
    query.country.trim().toLowerCase() === row.country.trim().toLowerCase()
  ) {
    reasons.push("same city and country");
    score += 1;
  }
  if (query.parent_company_id && row.parent_company_id && query.parent_company_id === row.parent_company_id) {
    reasons.push("same parent company");
    score += 1;
  }

  if (reasons.length === 0) return null;
  const confidence: Candidate["match_confidence"] = score >= 5 ? "High" : score >= 3 ? "Medium" : "Low";
  return {
    company_id: row.id,
    name: row.name,
    website: row.website,
    city: row.city,
    country: row.country,
    company_type: row.company_type,
    parent_company_id: row.parent_company_id,
    match_reasons: reasons,
    match_confidence: confidence,
  };
}

// More than one plausible (non-Low) candidate means the caller must not auto-create or auto-link.
export const isAmbiguous = (candidates: Candidate[]) => candidates.filter((c) => c.match_confidence !== "Low").length > 1;

function rankAndScore(rows: CompanyRow[], facts: CandidateFacts): Candidate[] {
  const order = { High: 0, Medium: 1, Low: 2 };
  return rows
    .map((r) => scoreCandidate(facts, r))
    .filter((c): c is Candidate => c !== null)
    .sort((a, b) => order[a.match_confidence] - order[b.match_confidence]);
}

const COLUMNS = "id, name, website, city, country, phone, address_line_1, company_type, parent_company_id";

// Read path (the search_companies MCP tool): loose OR filters pull a bounded candidate pool,
// then the same scoring function ranks it. No exact match required at the fetch stage --
// scoreCandidate is what decides whether something is actually a plausible match.
export async function findCandidatesViaSupabase(supabase: SupabaseClient, facts: CandidateFacts): Promise<Candidate[]> {
  const byId = new Map<number, CompanyRow>();
  const merge = (rows: CompanyRow[] | null | undefined) => rows?.forEach((r) => byId.set(r.id, r));

  if (facts.website) {
    const domain = normalizeDomain(facts.website);
    const { data } = await supabase.from("companies").select(COLUMNS).ilike("website", `%${domain}%`).is("deleted_at", null).limit(25);
    merge(data as CompanyRow[]);
  }
  if (facts.name) {
    const words = normalizeCompanyName(facts.name).split(" ").filter((w) => w.length > 2);
    const core = words.slice(0, 3).join(" ") || facts.name;
    const { data } = await supabase.from("companies").select(COLUMNS).ilike("name", `%${core}%`).is("deleted_at", null).limit(25);
    merge(data as CompanyRow[]);
  }
  if (facts.phone) {
    const digits = normalizePhoneDigits(facts.phone).slice(-7); // last 7 digits: tolerant of formatting/country-code differences
    if (digits.length >= 7) {
      const { data } = await supabase.from("companies").select(COLUMNS).ilike("phone", `%${digits}%`).is("deleted_at", null).limit(25);
      merge(data as CompanyRow[]);
    }
  }
  if (facts.city && facts.country) {
    const { data } = await supabase
      .from("companies")
      .select(COLUMNS)
      .ilike("city", facts.city)
      .ilike("country", facts.country)
      .is("deleted_at", null)
      .limit(50);
    merge(data as CompanyRow[]);
  }
  if (facts.parent_company_id) {
    const { data } = await supabase.from("companies").select(COLUMNS).eq("parent_company_id", facts.parent_company_id).is("deleted_at", null).limit(50);
    merge(data as CompanyRow[]);
  }

  return rankAndScore([...byId.values()], facts);
}

// Same logic against a raw pg connection, for use inside apply_research_result's transaction
// (parent/sibling dedup must see the same in-flight changes as everything else in that
// transaction, which a separate Supabase/PostgREST call would not).
export async function findCandidatesViaPg(client: PgClient, facts: CandidateFacts): Promise<Candidate[]> {
  const byId = new Map<number, CompanyRow>();
  const merge = (rows: CompanyRow[]) => rows.forEach((r) => byId.set(Number(r.id), r));
  const sel = `SELECT ${COLUMNS} FROM companies WHERE deleted_at IS NULL AND `;

  if (facts.website) {
    const domain = normalizeDomain(facts.website);
    merge((await client.query(sel + "website ILIKE $1", [`%${domain}%`])).rows);
  }
  if (facts.name) {
    const words = normalizeCompanyName(facts.name).split(" ").filter((w) => w.length > 2);
    const core = words.slice(0, 3).join(" ") || facts.name;
    merge((await client.query(sel + "name ILIKE $1", [`%${core}%`])).rows);
  }
  if (facts.phone) {
    const digits = normalizePhoneDigits(facts.phone).slice(-7);
    if (digits.length >= 7) merge((await client.query(sel + "phone ILIKE $1", [`%${digits}%`])).rows);
  }
  if (facts.city && facts.country) {
    merge((await client.query(sel + "city ILIKE $1 AND country ILIKE $2", [facts.city, facts.country])).rows);
  }
  if (facts.parent_company_id) {
    merge((await client.query(sel + "parent_company_id = $1", [facts.parent_company_id])).rows);
  }

  return rankAndScore([...byId.values()], facts);
}

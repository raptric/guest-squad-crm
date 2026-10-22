import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchEnum, matchCountry } from "@/lib/companies/matching";
import { fetchPicklistValues } from "@/lib/picklists";

const MAX_BATCH_SIZE = 500;

type IncomingHotel = {
  name?: string;
  domain?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  google_rating?: string | number;
  google_review_count?: string | number;
  hs_lead_status?: string;
  gs_company_type?: string;
  gs_property_type?: string;
  // Free text (companies.source has no DB CHECK) -- defaults to "google_maps" if omitted.
  source?: string;
  // Campaign/batch details, flat so a field-mapping scraper can send them as static values.
  // Same meaning as the optional top-level `batch` object (see parseBatch).
  campaign_id?: string;
  campaign_name?: string;
  campaign_country?: string;
  campaign_state?: string;
  campaign_city?: string;
  campaign_notes?: string;
};

type BatchSpec = {
  campaign_id: string;
  campaign_name: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  notes: string | null;
};

const clean = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() || null : null);

// Reads campaign details from either a `batch` object ({campaign_id, campaign_name, country,
// state, city, notes}) or the flat campaign_* fields. Returns null when none were sent, an
// error string when details were sent without the required campaign_id.
function parseBatch(source: Record<string, unknown> | undefined): BatchSpec | null | string {
  if (!source) return null;
  const nested = (source.batch ?? {}) as Record<string, unknown>;
  const pick = (nestedKey: string, flatKey: string) => clean(nested[nestedKey]) ?? clean(source[flatKey]);
  const spec = {
    campaign_id: pick("campaign_id", "campaign_id"),
    campaign_name: pick("campaign_name", "campaign_name"),
    country: pick("country", "campaign_country"),
    state: pick("state", "campaign_state"),
    city: pick("city", "campaign_city"),
    notes: pick("notes", "campaign_notes"),
  };
  if (Object.values(spec).every((v) => v === null)) return null;
  if (!spec.campaign_id) return "campaign_id is required when sending campaign details";
  if (spec.campaign_id.length > 100) return "campaign_id must be 100 characters or fewer";
  return spec as BatchSpec;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.INGEST_API_KEY}`;
  if (!process.env.INGEST_API_KEY || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  // Accepts either a single hotel object (one gscraper record per request, matching how it
  // likely posts to HubSpot today) or a batch: { "hotels": [ ... ] }.
  const hotels: IncomingHotel[] = Array.isArray(body.hotels)
    ? body.hotels
    : body.name
      ? [body]
      : [];

  if (hotels.length === 0) {
    return NextResponse.json(
      { error: "Provide a single hotel object, or { \"hotels\": [...] } for a batch" },
      { status: 400 }
    );
  }
  if (hotels.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: `Batch too large, max ${MAX_BATCH_SIZE} per request` }, { status: 400 });
  }

  const supabase = createAdminClient();
  const [validLeadStatuses, validCompanyTypes, validPropertyTypes, validCountries] = await Promise.all([
    fetchPicklistValues(supabase, "lead_status"),
    fetchPicklistValues(supabase, "company_type"),
    fetchPicklistValues(supabase, "property_type"),
    fetchPicklistValues(supabase, "country"),
  ]);
  const results: { index: number; status: "created" | "skipped"; company_id?: number; batch_id?: number; error?: string }[] = [];

  // Request-level campaign details: `batch` object or flat campaign_* fields on the body.
  // A record's own flat campaign_* fields (batch-per-hotel posts) override this for that record.
  const requestBatch = parseBatch(body);
  if (typeof requestBatch === "string") {
    return NextResponse.json({ error: requestBatch }, { status: 400 });
  }

  // First request with a campaign_id creates the batch; later ones attach to it. The first
  // request defines the details -- they are never overwritten afterwards.
  const batchIds = new Map<string, number>();
  async function ensureBatch(spec: BatchSpec): Promise<number> {
    const cached = batchIds.get(spec.campaign_id);
    if (cached) return cached;
    const find = () => supabase.from("import_batches").select("id").eq("campaign_id", spec.campaign_id).maybeSingle();
    let { data: existing } = await find();
    if (!existing) {
      const { data: inserted, error } = await supabase
        .from("import_batches")
        .insert({
          campaign_id: spec.campaign_id,
          campaign_name: spec.campaign_name ?? spec.campaign_id,
          country: matchCountry(spec.country ?? undefined, validCountries) ?? spec.country,
          state: spec.state,
          city: spec.city,
          notes: spec.notes,
        })
        .select("id")
        .single();
      // A concurrent request may have created it between our select and insert.
      existing = inserted ?? (await find()).data;
      if (!existing) throw new Error(error?.message ?? "could not create batch");
    }
    batchIds.set(spec.campaign_id, existing.id);
    return existing.id;
  }

  // No dedup here by design -- every incoming record is inserted as its own company.
  // Chain-affiliated properties often share a generic corporate domain (e.g. "hilton.com"),
  // so matching by website would incorrectly collapse distinct hotels into one record.
  for (let index = 0; index < hotels.length; index++) {
    const h = hotels[index];

    if (!h.name) {
      results.push({ index, status: "skipped", error: "name is required" });
      continue;
    }

    const ownBatch = parseBatch(h as Record<string, unknown>);
    if (typeof ownBatch === "string") {
      results.push({ index, status: "skipped", error: ownBatch });
      continue;
    }
    let batchId: number | null = null;
    const batchSpec = ownBatch ?? requestBatch;
    if (batchSpec) {
      try {
        batchId = await ensureBatch(batchSpec);
      } catch (e) {
        results.push({ index, status: "skipped", error: `batch: ${(e as Error).message}` });
        continue;
      }
    }

    const companyType = matchEnum(h.gs_company_type, validCompanyTypes, "Property")!;
    const propertyType = matchEnum(h.gs_property_type, validPropertyTypes, null);
    const leadStatus = matchEnum(h.hs_lead_status, validLeadStatuses, "New")!;
    const rating = h.google_rating !== undefined && h.google_rating !== "" ? parseFloat(String(h.google_rating)) : null;
    const reviewCount =
      h.google_review_count !== undefined && h.google_review_count !== ""
        ? parseInt(String(h.google_review_count), 10)
        : null;

    const { data: created, error } = await supabase
      .from("companies")
      .insert({
        name: h.name,
        website: h.domain || null,
        phone: h.phone || null,
        email: h.email?.trim().toLowerCase() || null,
        address_line_1: h.address || null,
        city: h.city || null,
        state: h.state || null,
        zip: h.zip || null,
        country: matchCountry(h.country, validCountries) ?? (h.country?.trim() || null),
        company_type: companyType,
        lifecycle_stage: "Lead",
        lead_status: leadStatus,
        source: h.source?.trim() || "google_maps",
        import_batch_id: batchId,
      })
      .select("id")
      .single();

    if (error || !created) {
      results.push({ index, status: "skipped", error: error?.message ?? "insert failed" });
      continue;
    }
    const companyId = created.id;

    if (companyType === "Property") {
      await supabase.from("property_details").insert({
        company_id: companyId,
        property_type: propertyType,
        portfolio_role: "Independent",
      });
    }

    if (rating !== null || reviewCount !== null) {
      await supabase.from("company_ratings").insert({
        company_id: companyId,
        channel: "google",
        rating,
        review_count: reviewCount,
        captured_at: new Date().toISOString(),
      });
    }

    results.push({ index, status: "created", company_id: companyId, ...(batchId ? { batch_id: batchId } : {}) });
  }

  // For the batch this request belongs to: the batch id plus how many companies it holds in total.
  let batchSummary: { batch_id: number; campaign_id: string; companies_in_batch: number } | undefined;
  if (requestBatch && batchIds.has(requestBatch.campaign_id)) {
    const batchId = batchIds.get(requestBatch.campaign_id)!;
    const { count } = await supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("import_batch_id", batchId);
    batchSummary = { batch_id: batchId, campaign_id: requestBatch.campaign_id, companies_in_batch: count ?? 0 };
  }

  const summary = {
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    ...(batchSummary ? { batch: batchSummary } : {}),
    results,
  };

  return NextResponse.json(summary, { status: 200 });
}

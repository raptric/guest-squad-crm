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
  // Set on the campaign's final record to close it (see parseBatch).
  campaign_complete?: boolean | string | number;
};

type BatchSpec = {
  campaign_id: string;
  campaign_name: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  notes: string | null;
  // True when the scraper flags this as the campaign's last push -- the campaign is then closed.
  complete: boolean;
};

const clean = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() || null : null);
const isTrue = (v: unknown) => v === true || (typeof v === "string" || typeof v === "number") && ["true", "yes", "y", "1"].includes(String(v).trim().toLowerCase());

// Reads campaign details from either a `batch` object ({campaign_id, campaign_name, country,
// state, city, notes, complete}) or the flat campaign_* fields (campaign_complete = "last record
// of the campaign" flag). Returns null when none were sent, an error string when details were
// sent without the required campaign_id.
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
  const complete = isTrue(nested.complete) || isTrue(source.campaign_complete);
  if (!complete && Object.values(spec).every((v) => v === null)) return null;
  if (!spec.campaign_id) return "campaign_id is required when sending campaign details";
  if (spec.campaign_id.length > 100) return "campaign_id must be 100 characters or fewer";
  return { ...spec, complete } as BatchSpec;
}

// What the monitor shows for each call to this endpoint (import_push_log).
type PushLog = {
  status_code: number;
  outcome: "ok" | "partial" | "failed" | "unauthorized";
  received: number;
  created: number;
  skipped: number;
  error?: string;
  skipped_detail?: { index: number; error?: string }[];
  campaign_id?: string;
  batch_id?: number;
};
type Handled = { status: number; payload: unknown; log: PushLog };

const rejected = (
  status: number,
  error: string,
  received = 0,
  outcome: PushLog["outcome"] = "failed",
  campaign_id?: string
): Handled => ({
  status,
  payload: { error },
  log: { status_code: status, outcome, received, created: 0, skipped: 0, error, campaign_id },
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  const { status, payload, log } = await handlePost(request);
  // Best effort: a logging problem must never fail or slow down an import.
  try {
    await createAdminClient().from("import_push_log").insert({
      ...log,
      skipped_detail: log.skipped_detail?.length ? log.skipped_detail : null,
      duration_ms: Date.now() - startedAt,
    });
  } catch {}
  return NextResponse.json(payload, { status });
}

async function handlePost(request: Request): Promise<Handled> {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.INGEST_API_KEY}`;
  if (!process.env.INGEST_API_KEY || authHeader !== expected) {
    return rejected(401, "Unauthorized", 0, "unauthorized");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return rejected(400, "Request body is not valid JSON");
  }
  // Accepts either a single hotel object (one gscraper record per request, matching how it
  // likely posts to HubSpot today) or a batch: { "hotels": [ ... ] }.
  const hotels: IncomingHotel[] = Array.isArray(body.hotels)
    ? body.hotels
    : body.name
      ? [body]
      : [];

  // Request-level campaign details: `batch` object or flat campaign_* fields on the body.
  // A record's own flat campaign_* fields (batch-per-hotel posts) override this for that record.
  const requestBatch = parseBatch(body);
  if (typeof requestBatch === "string") {
    return rejected(400, requestBatch, hotels.length);
  }

  // A call with no hotels is only valid as a "closing" call: campaign_id + campaign_complete.
  if (hotels.length === 0 && !requestBatch?.complete) {
    // Field names only (never values) so the monitor can show what the caller actually sent.
    const fields = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body).join(", ") : typeof body;
    return rejected(
      400,
      `Provide a single hotel object (with name), or { "hotels": [...] } for a batch. Received fields: ${fields || "none"}`,
      0,
      "failed",
      requestBatch?.campaign_id
    );
  }
  if (hotels.length > MAX_BATCH_SIZE) {
    return rejected(400, `Batch too large, max ${MAX_BATCH_SIZE} per request`, hotels.length);
  }

  const supabase = createAdminClient();
  const [validLeadStatuses, validCompanyTypes, validPropertyTypes, validCountries] = await Promise.all([
    fetchPicklistValues(supabase, "lead_status"),
    fetchPicklistValues(supabase, "company_type"),
    fetchPicklistValues(supabase, "property_type"),
    fetchPicklistValues(supabase, "country"),
  ]);
  const results: { index: number; status: "created" | "skipped"; company_id?: number; batch_id?: number; error?: string }[] = [];

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

  // The scraper flags a campaign's last push (campaign_complete) to close it -- on the request, or on
  // any record. Done after the inserts so the campaign is only closed once its data is in. Closing
  // is one-way: there is no reopen, and a flag on an already-completed campaign changes nothing.
  const completions = new Map<string, BatchSpec>();
  if (requestBatch?.complete) completions.set(requestBatch.campaign_id, requestBatch);
  for (const h of hotels) {
    const own = parseBatch(h as Record<string, unknown>);
    if (own && typeof own !== "string" && own.complete) completions.set(own.campaign_id, own);
  }
  const warnings: string[] = [];
  for (const spec of completions.values()) {
    try {
      const id = await ensureBatch(spec);
      await supabase
        .from("import_batches")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "open");
    } catch (e) {
      warnings.push(`could not complete campaign "${spec.campaign_id}": ${(e as Error).message}`);
    }
  }

  // For the batch this request belongs to: id, status, and how many companies it holds in total.
  let batchSummary:
    | { batch_id: number; campaign_id: string; status: string; companies_in_batch: number }
    | undefined;
  if (requestBatch && batchIds.has(requestBatch.campaign_id)) {
    const batchId = batchIds.get(requestBatch.campaign_id)!;
    const [{ count }, { data: batchRow }] = await Promise.all([
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("import_batch_id", batchId),
      supabase.from("import_batches").select("status").eq("id", batchId).single(),
    ]);
    batchSummary = {
      batch_id: batchId,
      campaign_id: requestBatch.campaign_id,
      status: batchRow?.status ?? "open",
      companies_in_batch: count ?? 0,
    };
    // Data still arriving for a campaign that was already closed -- kept, but flagged.
    if (batchSummary.status === "completed" && !requestBatch.complete && results.some((r) => r.status === "created")) {
      warnings.push(`campaign "${requestBatch.campaign_id}" is already completed; companies were added but it stays completed`);
    }
  }

  const summary = {
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    ...(batchSummary ? { batch: batchSummary } : {}),
    ...(warnings.length ? { warnings } : {}),
    results,
  };

  const skippedRows = results.filter((r) => r.status === "skipped");
  const loggedBatchId = requestBatch ? batchIds.get(requestBatch.campaign_id) : [...batchIds.values()][0];
  return {
    status: 200,
    payload: summary,
    log: {
      status_code: 200,
      outcome: skippedRows.length === 0 ? "ok" : summary.created > 0 ? "partial" : "failed",
      received: hotels.length,
      created: summary.created,
      skipped: summary.skipped,
      error: skippedRows[0]?.error,
      skipped_detail: skippedRows.slice(0, 20).map((r) => ({ index: r.index, error: r.error })),
      campaign_id: requestBatch?.campaign_id ?? [...batchIds.keys()][0],
      batch_id: loggedBatchId,
    },
  };
}

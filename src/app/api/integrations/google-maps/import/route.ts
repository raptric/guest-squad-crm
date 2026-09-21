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
};

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
  const results: { index: number; status: "created" | "skipped"; company_id?: number; error?: string }[] = [];

  // No dedup here by design -- every incoming record is inserted as its own company.
  // Chain-affiliated properties often share a generic corporate domain (e.g. "hilton.com"),
  // so matching by website would incorrectly collapse distinct hotels into one record.
  for (let index = 0; index < hotels.length; index++) {
    const h = hotels[index];

    if (!h.name) {
      results.push({ index, status: "skipped", error: "name is required" });
      continue;
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

    results.push({ index, status: "created", company_id: companyId });
  }

  const summary = {
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };

  return NextResponse.json(summary, { status: 200 });
}

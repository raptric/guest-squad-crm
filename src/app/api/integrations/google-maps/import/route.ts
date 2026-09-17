import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMPANY_TYPES, PROPERTY_TYPES, LEAD_STATUSES } from "@/lib/companies/constants";

const MAX_BATCH_SIZE = 500;

type IncomingHotel = {
  name?: string;
  domain?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  google_rating?: string | number;
  google_review_count?: string | number;
  hs_lead_status?: string;
  gs_company_type?: string;
  gs_property_type?: string;
};

function matchEnum(value: string | undefined, allowed: readonly string[], fallback: string | null) {
  if (!value) return fallback;
  const hit = allowed.find((a) => a.toLowerCase() === value.toLowerCase());
  return hit ?? fallback;
}

// Strips protocol/www/trailing slash so "https://www.foo.com/" and "foo.com" match.
function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.INGEST_API_KEY}`;
  if (!process.env.INGEST_API_KEY || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const hotels: IncomingHotel[] = Array.isArray(body.hotels) ? body.hotels : [];

  if (hotels.length === 0) {
    return NextResponse.json({ error: "hotels must be a non-empty array" }, { status: 400 });
  }
  if (hotels.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: `Batch too large, max ${MAX_BATCH_SIZE} per request` }, { status: 400 });
  }

  const supabase = createAdminClient();
  const results: { index: number; status: "created" | "updated" | "skipped"; company_id?: number; error?: string }[] = [];

  for (let index = 0; index < hotels.length; index++) {
    const h = hotels[index];

    if (!h.name) {
      results.push({ index, status: "skipped", error: "name is required" });
      continue;
    }

    const companyType = matchEnum(h.gs_company_type, COMPANY_TYPES, "Property")!;
    const propertyType = matchEnum(h.gs_property_type, PROPERTY_TYPES, null);
    const leadStatus = matchEnum(h.hs_lead_status, LEAD_STATUSES, "New")!;
    const rating = h.google_rating !== undefined && h.google_rating !== "" ? parseFloat(String(h.google_rating)) : null;
    const reviewCount =
      h.google_review_count !== undefined && h.google_review_count !== ""
        ? parseInt(String(h.google_review_count), 10)
        : null;

    // Dedup by website/domain -- the only reliable key this scraper provides.
    let existingId: number | null = null;
    if (h.domain) {
      const normalized = normalizeDomain(h.domain);
      const { data: candidates } = await supabase
        .from("companies")
        .select("id, website")
        .ilike("website", `%${normalized}%`)
        .is("deleted_at", null);

      existingId = candidates?.find((c) => c.website && normalizeDomain(c.website) === normalized)?.id ?? null;
    }

    let companyId: number;

    if (existingId) {
      const updateFields: Record<string, string> = { name: h.name };
      if (h.phone) updateFields.phone = h.phone;
      if (h.address) updateFields.address_line_1 = h.address;
      if (h.city) updateFields.city = h.city;
      if (h.state) updateFields.state = h.state;
      if (h.zip) updateFields.zip = h.zip;

      const { error } = await supabase.from("companies").update(updateFields).eq("id", existingId);
      if (error) {
        results.push({ index, status: "skipped", error: error.message });
        continue;
      }
      companyId = existingId;
      results.push({ index, status: "updated", company_id: companyId });
    } else {
      const { data: created, error } = await supabase
        .from("companies")
        .insert({
          name: h.name,
          website: h.domain || null,
          phone: h.phone || null,
          address_line_1: h.address || null,
          city: h.city || null,
          state: h.state || null,
          zip: h.zip || null,
          company_type: companyType,
          lifecycle_stage: "Prospect",
          lead_status: leadStatus,
          source: "google_maps",
        })
        .select("id")
        .single();

      if (error || !created) {
        results.push({ index, status: "skipped", error: error?.message ?? "insert failed" });
        continue;
      }
      companyId = created.id;

      if (companyType === "Property") {
        await supabase.from("property_details").insert({
          company_id: companyId,
          property_type: propertyType,
          portfolio_role: "Independent",
        });
      }

      results.push({ index, status: "created", company_id: companyId });
    }

    if (rating !== null || reviewCount !== null) {
      await supabase
        .from("company_ratings")
        .upsert(
          { company_id: companyId, channel: "google", rating, review_count: reviewCount, captured_at: new Date().toISOString() },
          { onConflict: "company_id,channel" }
        );
    }
  }

  const summary = {
    created: results.filter((r) => r.status === "created").length,
    updated: results.filter((r) => r.status === "updated").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };

  return NextResponse.json(summary, { status: 200 });
}

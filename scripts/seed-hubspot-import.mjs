// One-off seed: imports a HubSpot-style export sample into the new schema, to surface
// real-world gaps between what the old system tracked and what we've built so far.
// Usage: node scripts/seed-hubspot-import.mjs
import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const LEAD_STATUS_MAP = { QUALIFIED: "Qualified" };
const LIFECYCLE_MAP = { salesqualifiedlead: "Sales Qualified Lead" };

const records = [
  {
    property_profile: { hotel_name: "The Greenwich Hotel", website: "thegreenwichhotel.com", phone: "(212) 941-8900", address: "377 Greenwich St, New York, NY 10013", city: "New York", state_region: "NY", postal_code: "10013", country: "United States", property_type: "Boutique Hotel" },
    crm_status: { lead_status: "QUALIFIED", lifecycle_stage: "salesqualifiedlead" },
    qualification: { priority_tier: "Tier 1", summary: "Luxury independent-feeling boutique hotel in Tribeca with 88 rooms, direct sales contact, and a strong service-led guest experience profile." },
    sales_signals: { guest_pain_type: null, sdr_signal_summary: "High-touch boutique positioning and direct reservations/service model make guest communication operations commercially relevant even without a visible public pain signal." },
    reputation: { google: { rating: "4.6", review_count: "434" }, tripadvisor: { rating: "4", review_count: "713" } },
    hiring_signal: { role: null },
    portfolio: { role: "Independent", size: null, primary_operating_parent: null },
  },
  {
    property_profile: { hotel_name: "The Gotham Hotel", website: "thegothamhotelny.com", phone: "212.490.8500", address: "16 East 46th Street", city: "New York", country: "United States", property_type: "Boutique Hotel" },
    crm_status: { lead_status: "QUALIFIED", lifecycle_stage: "salesqualifiedlead" },
    qualification: { priority_tier: "Tier 1", summary: "Independent family-operated 67-room boutique hotel with strong review volume and a personalized guest-service positioning." },
    sales_signals: { guest_pain_type: null, sdr_signal_summary: "Independent family-operated positioning, 67 rooms, and a personalized boutique-service promise make guest communication operations strategically relevant." },
    reputation: { google: { rating: "4.3", review_count: "830" }, booking_com: { rating: "8.7", review_count: "1291" }, tripadvisor: { rating: "4.2", review_count: "1351" }, expedia: { rating: "9", review_count: "1689" } },
    hiring_signal: { role: null },
    portfolio: { role: "Independent", size: null, primary_operating_parent: null },
  },
  {
    property_profile: { hotel_name: "The Hotel Chelsea", website: "hotelchelsea.com", phone: "(212) 483-1010", address: "222 W 23rd St, New York, NY 10011", city: "New York", state_region: "NY", postal_code: "10011", country: "United States", property_type: "Boutique Hotel" },
    crm_status: { lead_status: "QUALIFIED", lifecycle_stage: "salesqualifiedlead" },
    qualification: { priority_tier: "Tier 1", summary: "Historic boutique New York property with direct contact path, strong hospitality reputation, and a guest-experience-led operating model." },
    sales_signals: { guest_pain_type: null, sdr_signal_summary: "Historic boutique positioning, premium guest experience, and direct property contact path make communication excellence strategically important." },
    reputation: { google: { rating: "4.7" }, booking_com: { rating: "9.3", review_count: "664" }, tripadvisor: { rating: "4.9", review_count: "448" } },
    hiring_signal: { role: null },
    portfolio: { role: "Independent", size: null, primary_operating_parent: null },
  },
  {
    property_profile: { hotel_name: "Easy Hotel Reading", website: null, phone: null, address: null, city: "Reading", country: "United Kingdom", property_type: "Hotel" },
    crm_status: { lead_status: "QUALIFIED", lifecycle_stage: "salesqualifiedlead" },
    qualification: { priority_tier: "Tier 2", summary: null },
    sales_signals: { guest_pain_type: "Unknown", sdr_signal_summary: "The property has substantial Booking.com review volume and a lower overall guest score, but the observed feedback is primarily room-product and amenity related rather than a verified guest-communication failure." },
    reputation: { booking_com: { rating: "6.8", review_count: "1467" } },
    hiring_signal: { role: null },
    portfolio: { role: "Portfolio Property", size: "22", primary_operating_parent: "Splendid Hospitality Group" },
  },
  {
    property_profile: { hotel_name: "Holiday Inn Express Glenrothes", website: null, phone: null, address: null, city: "Glenrothes", country: "United Kingdom", property_type: "Hotel" },
    crm_status: { lead_status: "QUALIFIED", lifecycle_stage: "salesqualifiedlead" },
    qualification: { priority_tier: "Tier 2", summary: null },
    sales_signals: { guest_pain_type: "Unknown", sdr_signal_summary: "The property has consistent multi-source review coverage and is part of a confirmed multi-property operating portfolio, but no verified direct guest-communication failure was found." },
    reputation: { google: { rating: "4.2", review_count: "402" }, booking_com: { rating: "8.4", review_count: "938" }, tripadvisor: { rating: "4.1", review_count: "399" }, expedia: { rating: "8.8", review_count: "821" }, hotels_com: { rating: "8.8", review_count: "811" } },
    hiring_signal: { role: null },
    portfolio: { role: "Portfolio Property", size: "22", primary_operating_parent: "Splendid Hospitality Group" },
  },
  {
    property_profile: { hotel_name: "Holiday Inn Brentford Lock", website: "https://hibrentfordlock.co.uk/", phone: null, address: null, city: "Brentford", country: "United Kingdom", property_type: "Hotel" },
    crm_status: { lead_status: "QUALIFIED", lifecycle_stage: "salesqualifiedlead" },
    qualification: { priority_tier: "Tier 2", summary: "Verified portfolio property with meaningful review volume and operational scale within the confirmed Splendid Hospitality Group portfolio." },
    sales_signals: { guest_pain_type: "Unknown", sdr_signal_summary: "A busy canal-side hotel in a 22-property operating portfolio has high review volume, including some service and in-stay issue feedback, but no verified direct guest-communication failure." },
    reputation: { google: { rating: "4.2", review_count: "1765" }, booking_com: { rating: "8", review_count: "1454" }, tripadvisor: { rating: "4.1", review_count: "881" } },
    hiring_signal: { role: null },
    portfolio: { role: "Portfolio Property", size: "22", primary_operating_parent: "Splendid Hospitality Group" },
  },
  {
    property_profile: { hotel_name: "Holiday Inn Express Leeds East", website: null, phone: null, address: null, city: "Leeds", country: "United Kingdom", property_type: "Hotel" },
    crm_status: { lead_status: "QUALIFIED", lifecycle_stage: "salesqualifiedlead" },
    qualification: { priority_tier: "Tier 2", summary: null },
    sales_signals: { guest_pain_type: "Front Desk Staffing;Guest Requests", sdr_signal_summary: "Indexed public review evidence includes a guest reporting an unattended reception and unresolved room-maintenance problems. This is a limited but relevant guest-support signal; wider review evidence also reflects many positive staff experiences." },
    reputation: { google: { rating: "4", review_count: "504" }, tripadvisor: { rating: "4", review_count: "584" }, expedia: { rating: "4.1", review_count: "736" }, hotels_com: { rating: "8.4", review_count: "763" } },
    hiring_signal: { role: null },
    portfolio: { role: "Portfolio Property", size: "22", primary_operating_parent: "Splendid Hospitality Group" },
  },
  {
    property_profile: { hotel_name: "Holiday Inn London Wembley", website: "https://www.ihg.com/holidayinn/hotels/us/en/wembley/lonwe/hoteldetail", phone: null, address: null, city: "Wembley", country: "United Kingdom", property_type: "Hotel" },
    crm_status: { lead_status: "QUALIFIED", lifecycle_stage: "salesqualifiedlead" },
    qualification: { priority_tier: "Tier 1", summary: null },
    sales_signals: { guest_pain_type: "Unknown", sdr_signal_summary: "The verified 336-room Wembley hotel has seven event spaces and substantial guest-operational scale, but this research found no verified direct guest-communication failure." },
    reputation: { google: { rating: "4", review_count: "1967" }, tripadvisor: { rating: "3.7", review_count: "1660" } },
    hiring_signal: { role: null },
    portfolio: { role: "Portfolio Property", size: "22", primary_operating_parent: "Splendid Hospitality Group" },
  },
  {
    property_profile: { hotel_name: "Hilton London Bankside", website: "https://www.hilton.com/en/hotels/lonsbhi-hilton-london-bankside/", phone: null, address: null, city: "London", country: "United Kingdom", property_type: "Hotel" },
    crm_status: { lead_status: "QUALIFIED", lifecycle_stage: "salesqualifiedlead" },
    qualification: { priority_tier: "Tier 1", summary: "Verified central London Hilton property operated within the confirmed Splendid Hospitality Group portfolio; portfolio scale materially strengthens the opportunity." },
    sales_signals: { guest_pain_type: "Unknown", sdr_signal_summary: "A large central-London hotel within a confirmed 22-hotel operating portfolio has strategic scale, but no verified public guest-communication pain was found." },
    reputation: {},
    hiring_signal: { role: null },
    portfolio: { role: "Portfolio Property", size: "22", primary_operating_parent: "Splendid Hospitality Group" },
  },
  {
    property_profile: { hotel_name: "Holiday Inn Northampton West", website: null, phone: null, address: null, city: "Northampton", country: "United Kingdom", property_type: "Hotel" },
    crm_status: { lead_status: "QUALIFIED", lifecycle_stage: "salesqualifiedlead" },
    qualification: { priority_tier: "Tier 2", summary: null },
    sales_signals: { guest_pain_type: "Front Desk Staffing", sdr_signal_summary: "A recent TripAdvisor review describes one team member serving the bar alone as the restaurant filled, suggesting a potentially thin guest-service coverage point. This should be treated as a targeted operational hypothesis, not a broad service claim." },
    reputation: { tripadvisor: { rating: "3.9", review_count: "134" }, expedia: { rating: "8.2", review_count: "246" }, hotels_com: { rating: "8.2", review_count: "246" } },
    hiring_signal: { role: null },
    portfolio: { role: "Portfolio Property", size: "22", primary_operating_parent: "Splendid Hospitality Group" },
  },
];

async function findOrCreateParent(name, size) {
  const existing = await client.query(`SELECT id FROM companies WHERE name = $1 AND deleted_at IS NULL`, [name]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  const { rows } = await client.query(
    `INSERT INTO companies (name, company_type, portfolio_size, country, lifecycle_stage, lead_status, source)
     VALUES ($1, 'Hotel Group / Portfolio', $2, 'United Kingdom', 'Opportunity', 'Qualified', 'other')
     RETURNING id`,
    [name, size]
  );
  return rows[0].id;
}

(async () => {
  await client.connect();
  let created = 0;
  const parentCache = new Map();

  for (const r of records) {
    let parentId = null;
    if (r.portfolio.primary_operating_parent) {
      const key = r.portfolio.primary_operating_parent;
      if (!parentCache.has(key)) {
        parentCache.set(key, await findOrCreateParent(key, parseInt(r.portfolio.size, 10)));
      }
      parentId = parentCache.get(key);
    }

    const { rows: companyRows } = await client.query(
      `INSERT INTO companies
        (name, website, phone, address_line_1, city, state, zip, country, company_type,
         parent_company_id, lifecycle_stage, lead_status, prospect_tier, qualification_summary,
         sdr_signal_summary, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Property',$9,$10,$11,$12,$13,$14,'other')
       RETURNING id`,
      [
        r.property_profile.hotel_name,
        r.property_profile.website,
        r.property_profile.phone,
        r.property_profile.address,
        r.property_profile.city,
        r.property_profile.state_region ?? null,
        r.property_profile.postal_code ?? null,
        r.property_profile.country,
        parentId,
        LIFECYCLE_MAP[r.crm_status.lifecycle_stage] ?? "Sales Qualified Lead",
        LEAD_STATUS_MAP[r.crm_status.lead_status] ?? "Qualified",
        r.qualification.priority_tier,
        r.qualification.summary,
        r.sales_signals.sdr_signal_summary,
      ]
    );
    const companyId = companyRows[0].id;
    created++;

    const { rows: pdRows } = await client.query(
      `INSERT INTO property_details (company_id, property_type, portfolio_role)
       VALUES ($1, $2, $3) RETURNING id`,
      [companyId, r.property_profile.property_type, r.portfolio.role]
    );
    const propertyDetailsId = pdRows[0].id;

    for (const [channel, data] of Object.entries(r.reputation)) {
      if (data.rating == null && data.review_count == null) continue;
      await client.query(
        `INSERT INTO company_ratings (company_id, channel, rating, review_count)
         VALUES ($1, $2, $3, $4)`,
        [companyId, channel, data.rating ? parseFloat(data.rating) : null, data.review_count ? parseInt(data.review_count, 10) : null]
      );
    }

    const painType = r.sales_signals.guest_pain_type;
    if (painType && painType !== "Unknown") {
      for (const pain of painType.split(";")) {
        await client.query(
          `INSERT INTO property_pain_signals (property_id, pain_type) VALUES ($1, $2)`,
          [propertyDetailsId, pain.trim()]
        );
      }
    }
  }

  console.log(`Seeded ${created} companies from HubSpot-style import (${parentCache.size} parent portfolio created/reused).`);
  await client.end();
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});

// One-off seed: a handful of realistic companies/properties/contacts for testing view+edit.
// Usage: node scripts/seed-companies.mjs
import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function insertCompany(fields) {
  const columns = Object.keys(fields);
  const values = Object.values(fields);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await client.query(
    `INSERT INTO companies (${columns.join(", ")}) VALUES (${placeholders}) RETURNING id`,
    values
  );
  return rows[0].id;
}

async function insertPropertyDetails(companyId, fields) {
  const columns = ["company_id", ...Object.keys(fields)];
  const values = [companyId, ...Object.values(fields)];
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(
    `INSERT INTO property_details (${columns.join(", ")}) VALUES (${placeholders})`,
    values
  );
}

async function insertContact(companyId, fields) {
  const columns = ["company_id", ...Object.keys(fields)];
  const values = [companyId, ...Object.values(fields)];
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  await client.query(
    `INSERT INTO contacts (${columns.join(", ")}) VALUES (${placeholders})`,
    values
  );
}

(async () => {
  await client.connect();

  // Portfolio 1: Sunrise Hotels Group
  const sunriseId = await insertCompany({
    name: "Sunrise Hotels Group",
    company_type: "Hotel Group / Portfolio",
    portfolio_size: 8,
    lifecycle_stage: "Customer",
    lead_status: "Engaged",
    source: "manual",
  });

  const sunriseDowntownId = await insertCompany({
    name: "Sunrise Downtown",
    company_type: "Property",
    parent_company_id: sunriseId,
    city: "Miami",
    state: "FL",
    country: "USA",
    lifecycle_stage: "Customer",
    lead_status: "Engaged",
    prospect_tier: "Tier 1",
    source: "manual",
  });
  await insertPropertyDetails(sunriseDowntownId, {
    property_type: "Hotel",
    property_class: "4 Star",
    rooms_units: 120,
    portfolio_role: "Flagship",
  });
  await insertContact(sunriseDowntownId, {
    first_name: "Maria",
    last_name: "Gonzalez",
    email: "maria.gonzalez@sunrisehotels.example",
    job_title: "General Manager",
    contact_role: "General Manager",
    decision_maker_level: "Primary Decision Maker",
  });

  const sunriseAirportId = await insertCompany({
    name: "Sunrise Airport Inn",
    company_type: "Property",
    parent_company_id: sunriseId,
    city: "Miami",
    state: "FL",
    country: "USA",
    lifecycle_stage: "Customer",
    lead_status: "Engaged",
    prospect_tier: "Tier 2",
    source: "manual",
  });
  await insertPropertyDetails(sunriseAirportId, {
    property_type: "Hotel",
    property_class: "3 Star",
    rooms_units: 80,
    portfolio_role: "Portfolio Property",
  });

  // Portfolio 2: Blue Horizon Resorts
  const blueHorizonId = await insertCompany({
    name: "Blue Horizon Resorts",
    company_type: "Management Company",
    portfolio_size: 3,
    lifecycle_stage: "Opportunity",
    lead_status: "Ready for Outreach",
    source: "manual",
  });

  const blueHorizonBeachId = await insertCompany({
    name: "Blue Horizon Beach Resort",
    company_type: "Property",
    parent_company_id: blueHorizonId,
    city: "Key West",
    state: "FL",
    country: "USA",
    lifecycle_stage: "Opportunity",
    lead_status: "Ready for Outreach",
    prospect_tier: "Tier 1",
    qualification_summary: "High-end resort, 200 rooms, strong seasonal demand.",
    source: "manual",
  });
  await insertPropertyDetails(blueHorizonBeachId, {
    property_type: "Resort",
    property_class: "5 Star",
    rooms_units: 200,
    portfolio_role: "Managed Property",
  });

  // Independent properties (no parent)
  const ivyId = await insertCompany({
    name: "The Ivy Boutique Hotel",
    company_type: "Property",
    city: "Austin",
    state: "TX",
    country: "USA",
    lifecycle_stage: "Lead",
    lead_status: "Researching",
    prospect_tier: "Tier 2",
    sdr_signal_summary: "Recently opened, hiring front desk staff across multiple shifts.",
    source: "manual",
  });
  await insertPropertyDetails(ivyId, {
    property_type: "Boutique Hotel",
    property_class: "4 Star",
    rooms_units: 40,
    portfolio_role: "Independent",
  });
  await insertContact(ivyId, {
    first_name: "James",
    last_name: "Carter",
    email: "james@ivyboutique.example",
    job_title: "Owner",
    contact_role: "Owner / Founder",
    decision_maker_level: "Primary Decision Maker",
  });

  const harborviewId = await insertCompany({
    name: "Harborview Inn",
    company_type: "Property",
    city: "Charleston",
    state: "SC",
    country: "USA",
    lifecycle_stage: "Prospect",
    lead_status: "New",
    source: "google_maps",
  });
  await insertPropertyDetails(harborviewId, {
    property_type: "B&B / Inn",
    property_class: "3 Star",
    rooms_units: 25,
    portfolio_role: "Independent",
  });

  console.log("Seeded 6 companies (2 portfolios + 4 properties), 2 contacts.");
  await client.end();
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});

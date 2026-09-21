// Cleanses a Google Maps scrape of Bahrain hotels and imports it as seed data.
//   node scripts/seed-bahrain.mjs "<path to csv>"            dry run: writes a cleaned CSV + report
//   node scripts/seed-bahrain.mjs "<path to csv>" --commit    imports into the database
// Safe to re-run: hotels already in the database (same name, country Bahrain) are skipped.
import fs from "fs";
import path from "path";
import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const file = process.argv[2];
const COMMIT = process.argv.includes("--commit");
if (!file) throw new Error("Usage: node scripts/seed-bahrain.mjs <csv> [--commit]");

// ---------- CSV ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const csvEscape = (v) => (/[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ""));

// ---------- helpers ----------
const report = [];
const note = (action, name, detail = "") => report.push({ action, name, detail });
// Bidi/zero-width marks Google adds around Arabic text.
const stripMarks = (s) => s.replace(/[​-‏‪-‮⁦-⁩﻿]/g, "");
const clean = (s) => stripMarks(String(s ?? "")).replace(/\s+/g, " ").trim();

const cidOf = (url) => (url.match(/!1s0x[0-9a-f]+:(0x[0-9a-f]+)/i) || [])[1]?.toLowerCase() ?? null;
const coordsOf = (url) => {
  const m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
};
const nameFromUrl = (url) => {
  const slug = (url.match(/\/maps\/place\/([^/]+)\//) || [])[1];
  if (!slug) return null;
  try { return clean(decodeURIComponent(slug.replace(/\+/g, " "))); } catch { return null; }
};
const cleanMapsUrl = (url) => url.split("?")[0];

const KEEP_UPPER = new Set(["WLL", "OYO", "IHG", "BW", "SPA", "II", "III"]);
function fixCase(name) {
  const letters = name.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4 || letters !== letters.toUpperCase()) return name;
  return name.replace(/[A-Za-z]+/g, (w) =>
    KEEP_UPPER.has(w) ? w : w[0] + w.slice(1).toLowerCase()
  );
}

const TRACKING = /^(utm_|cid$|iata$|seo_id$|scid$|merchantid$|sourceid$|cm_mmc$|chal_t$|force_referer$|mibextid$|igsh$|locale$|latitude$|longitude$|hl$|authuser$|g_ep$|rclk$|modal$)/i;
const LISTING_HOSTS = /(^|\.)(instagram\.com|facebook\.com|oyorooms\.com|booking\.com|agoda\.com|trip\.com|bookmystay\.io|tripadvisor\.[a-z.]+|expedia\.[a-z.]+)$/i;

// Returns { website, listing }: the hotel's own site, or (for social / OTA pages) a listing link.
function cleanWebsite(raw) {
  const value = clean(raw);
  if (!value) return { website: null, listing: null };
  let url;
  try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { return { website: null, listing: null }; }
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.hash = "";
  const out = url.toString().replace(/\/$/, "");
  const site = url.hostname.replace(/^www\./, "");
  return LISTING_HOSTS.test(site) ? { website: null, listing: out } : { website: out, listing: null };
}

const FREE_MAIL = /@(gmail|yahoo|hotmail|outlook|live|icloud|aol)\./i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(raw, name) {
  const value = clean(raw).toLowerCase();
  if (!value) return null;
  if (!EMAIL_RE.test(value)) { note("email dropped", name, `not a valid email: ${value}`); return null; }
  if (FREE_MAIL.test(value) && /^(hotel|info|admin|test|mail|contact)@/.test(value)) {
    note("email dropped", name, `generic address on a free-mail domain: ${value}`);
    return null;
  }
  return value;
}

const cleanPhone = (raw) => {
  const value = clean(raw);
  return /^\+\d[\d ]{6,}$/.test(value) ? value : null;
};

// ---------- location ----------
// [pattern, city, governorate]
const CITIES = [
  [/amwaj/i, "Amwaj Islands", "Muharraq"],
  [/marassi|diyar/i, "Muharraq", "Muharraq"],
  [/al[- ]?hidd|\bhidd\b/i, "Al Hidd", "Muharraq"],
  [/muharraq/i, "Muharraq", "Muharraq"],
  [/hamala/i, "Hamala", "Northern"],
  [/budaiya/i, "Budaiya", "Northern"],
  [/jannusan/i, "Jannusan", "Northern"],
  [/zallaq/i, "Zallaq", "Southern"],
  [/\bjaww?\b/i, "Jaww", "Southern"],
  [/hawar/i, "Hawar", "Southern"],
  [/mazrowiah/i, "Al Mazrowiah", "Southern"],
  [/sitra/i, "Sitra", "Capital"],
];
// Districts inside Manama: kept in address_line_2.
const DISTRICTS = [
  [/juffair/i, "Juffair"], [/\bseef\b/i, "Seef"], [/adliya/i, "Adliya"], [/sanabis/i, "Sanabis"],
  [/hoora/i, "Hoora"], [/mahooz/i, "Mahooz"], [/diplomatic/i, "Diplomatic Area"],
  [/bahrain bay/i, "Bahrain Bay"], [/gudaibiya|gudaybiya/i, "Gudaibiya"], [/um al[- ]?hass?am/i, "Um Al Hassam"],
];

function locate(address, coords, name = "") {
  // Some islands and resorts are only identifiable from the name (e.g. "Hawar Resort").
  for (const [re, city, gov] of CITIES) if (re.test(`${name} ${address}`)) return { city, state: gov, district: null };
  const district = DISTRICTS.find(([re]) => re.test(address))?.[1] ?? null;
  if (district || /manama/i.test(address)) return { city: "Manama", state: "Capital", district };
  // No usable text: fall back on the pin location.
  if (coords) {
    if (coords.lat > 26.27 && coords.lat < 26.32 && coords.lng > 50.63 && coords.lng < 50.69) return { city: "Amwaj Islands", state: "Muharraq", district: null };
    if (coords.lat > 26.19 && coords.lat < 26.27 && coords.lng > 50.52 && coords.lng < 50.62) return { city: "Manama", state: "Capital", district: null };
  }
  return { city: null, state: null, district: null };
}

function propertyType(name) {
  if (/resort/i.test(name)) return "Resort";
  if (/boutique/i.test(name)) return "Boutique Hotel";
  if (/chalet/i.test(name)) return "STR / Vacation Rental";
  if (/apartment|residence|\bflat\b/i.test(name)) return "Serviced Apartment";
  if (/suites?\b/i.test(name)) return "Aparthotel";
  return "Hotel";
}

const inBahrain = (c) => c && c.lat > 25.5 && c.lat < 26.4 && c.lng > 50.3 && c.lng < 50.9;
const NOT_LODGING = /catering|banquet|restaurant|staff accommodation/i;
const distanceM = (a, b) => {
  const dLat = (a.lat - b.lat) * 111_000;
  const dLng = (a.lng - b.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
};

// ---------- load & clean ----------
const rows = parseCsv(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
const head = rows[0].map((h) => h.trim());
const idx = Object.fromEntries(head.map((h, i) => [h, i]));
const get = (r, col) => (r[idx[col]] ?? "").trim();

let records = [];
for (const r of rows.slice(1)) {
  if (!r.some((x) => x.trim())) continue;
  const url = get(r, "Google Maps URL");
  const coords = coordsOf(url);
  let name = clean(get(r, "Business Name"));

  if (/^\$\d+/.test(name)) {
    const recovered = nameFromUrl(url);
    note("name repaired", name, `restored from the Maps link: ${recovered}`);
    name = recovered ?? name;
  }
  const original = name;
  name = fixCase(name.replace(/^[\s\-–|,.]+|[\s\-–|,]+$/g, ""));
  if (name !== original) note("name tidied", original, name);

  const address = clean(get(r, "Address"));
  if (!address && !inBahrain(coords)) { note("dropped", name, "no address and the pin is outside Bahrain"); continue; }
  if (!inBahrain(coords)) { note("dropped", name, "pin is outside Bahrain"); continue; }
  if (NOT_LODGING.test(name)) { note("dropped", name, "not a guest lodging (restaurant / catering / staff housing)"); continue; }

  const site = cleanWebsite(get(r, "Website"));
  if (site.listing) note("website moved", name, `social / booking page, not the hotel's own site: ${site.listing}`);
  const loc = locate(address, coords, name);
  if (!loc.city) note("location unknown", name, address);

  const rating = parseFloat(get(r, "Rating"));
  const reviews = parseInt(get(r, "Review Count"), 10);
  records.push({
    name,
    address,
    ...loc,
    phone: cleanPhone(get(r, "Phone (GMaps)")),
    email: cleanEmail(get(r, "email address"), name),
    website: site.website,
    listing_url: site.listing,
    rating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : null,
    review_count: Number.isFinite(reviews) ? reviews : null,
    google_maps_url: cleanMapsUrl(url),
    google_cid: cidOf(url),
    coords,
    scraped_at: get(r, "Scraped At"),
    property_type: propertyType(name),
  });
}

// Merge duplicates: same Google listing id, or same name within 100 m (a listing that was
// created twice). The first record wins; its blanks are filled from the others.
function merge(into, from) {
  for (const key of ["phone", "email", "website", "listing_url", "rating", "address"]) into[key] ??= from[key];
  if ((from.review_count ?? 0) > (into.review_count ?? 0)) { into.review_count = from.review_count; into.rating = from.rating ?? into.rating; }
  into.other_cids = [...new Set([...(into.other_cids ?? []), from.google_cid].filter((c) => c && c !== into.google_cid))];
}
const merged = [];
for (const rec of records) {
  const twin = merged.find(
    (m) =>
      (m.google_cid && m.google_cid === rec.google_cid) ||
      (m.name.toLowerCase() === rec.name.toLowerCase() && m.coords && rec.coords && distanceM(m.coords, rec.coords) < 100)
  );
  if (twin) {
    note("duplicate merged", rec.name, `combined with the earlier row for "${twin.name}"`);
    merge(twin, rec);
  } else merged.push(rec);
}
records = merged;

// ---------- output ----------
const out = path.join(path.dirname(file), "Bahrain Leads - Hotels (cleaned).csv");
const cols = ["name", "address_line_2", "city", "state", "country", "address", "phone", "email", "website", "listing_url", "rating", "review_count", "property_type"];
fs.writeFileSync(
  out,
  [cols.join(","), ...records.map((r) => cols.map((c) => csvEscape({ address_line_2: r.district, country: "Bahrain" }[c] ?? r[c])).join(","))].join("\n")
);
const summary = {};
for (const r of report) summary[r.action] = (summary[r.action] ?? 0) + 1;
console.log(`Input rows: ${rows.length - 1} -> clean records: ${records.length}`);
console.log("Actions:", summary);
console.log("With email:", records.filter((r) => r.email).length, "| website:", records.filter((r) => r.website).length, "| phone:", records.filter((r) => r.phone).length, "| rating:", records.filter((r) => r.rating).length);
const byCity = {};
records.forEach((r) => { const k = `${r.city ?? "(unknown)"}`; byCity[k] = (byCity[k] ?? 0) + 1; });
console.log("By city:", byCity);
const reportPath = path.join(path.dirname(file), "Bahrain Leads - cleaning report.csv");
fs.writeFileSync(reportPath, ["action,name,detail", ...report.map((r) => [r.action, r.name, r.detail].map(csvEscape).join(","))].join("\n"));
console.log(`Wrote ${out}\nWrote ${reportPath}`);

if (!COMMIT) {
  console.log("\nDry run only. Re-run with --commit to import.");
  process.exit(0);
}

// ---------- import ----------
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN");
  const { rows: existing } = await client.query("SELECT lower(name) AS name FROM companies WHERE country = 'Bahrain' AND deleted_at IS NULL");
  const have = new Set(existing.map((r) => r.name));
  let created = 0, skipped = 0;
  for (const r of records) {
    if (have.has(r.name.toLowerCase())) { skipped++; continue; }
    const { rows: [company] } = await client.query(
      `INSERT INTO companies (name, website, phone, email, address_line_1, address_line_2, city, state, country,
                              company_type, lifecycle_stage, lead_status, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Bahrain','Property','Lead','New','google_maps') RETURNING id`,
      [r.name, r.website, r.phone, r.email, r.address || null, r.district, r.city, r.state]
    );
    await client.query("INSERT INTO property_details (company_id, property_type, portfolio_role) VALUES ($1,$2,'Independent')", [company.id, r.property_type]);
    if (r.rating !== null || r.review_count !== null) {
      await client.query(
        "INSERT INTO company_ratings (company_id, channel, rating, review_count, captured_at) VALUES ($1,'google',$2,$3,$4)",
        [company.id, r.rating, r.review_count, r.scraped_at ? new Date(r.scraped_at.replace(" ", "T") + "Z") : new Date()]
      );
    }
    created++;
  }
  await client.query("COMMIT");
  console.log(`Imported ${created} companies (${skipped} already present).`);
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Import failed, nothing was saved:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

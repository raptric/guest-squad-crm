# Google Maps Import API — Integration Guide

Receives hotel/property records already scraped elsewhere (e.g. the `gscraper` pipeline)
and inserts or updates them as Companies in Guest Squad CRM. This is a machine-to-machine
endpoint — it does not use the browser session cookies the rest of the app uses.

- **Endpoint:** `POST /api/integrations/google-maps/import`
- **Source file:** [src/app/api/integrations/google-maps/import/route.ts](../../src/app/api/integrations/google-maps/import/route.ts)
- **Local URL:** `http://localhost:3000/api/integrations/google-maps/import`
- **Production URL:** `https://<your-deployed-domain>/api/integrations/google-maps/import`

## Authentication

Single shared secret, sent as a bearer token:

```
Authorization: Bearer <INGEST_API_KEY>
```

- The value lives in the `INGEST_API_KEY` environment variable ([.env.example](../../.env.example)).
- Missing or wrong header → `401 { "error": "Unauthorized" }`.
- This is one shared key for this integration, not a per-caller key system — treat it like
  a password. Anyone with it can create/update Company records.
- **Before going live on Vercel:** add `INGEST_API_KEY` to the project's environment
  variables there with the same value used locally, and update whatever tool calls this
  endpoint (gscraper) to send it against the production URL.

## Request body

Two accepted shapes:

**Single record** (one hotel per call — matches how gscraper likely posts to HubSpot today):

```json
{
  "name": "The Gotham Hotel",
  "domain": "thegothamhotelny.com",
  "phone": "212.490.8500",
  "address": "16 East 46th Street",
  "city": "New York",
  "state": "NY",
  "zip": "10017",
  "google_rating": "4.3",
  "google_review_count": "830",
  "hs_lead_status": "NEW",
  "gs_company_type": "Property",
  "gs_property_type": "Boutique Hotel"
}
```

**Batch** (multiple hotels in one call, up to 500):

```json
{ "hotels": [ { "name": "...", "domain": "...", "...": "..." }, { "...": "..." } ] }
```

### Field mapping

Configure gscraper's field mapping to send these exact property names — no translation
needed on either side.

| gscraper field (their UI label) | JSON property | Maps to | Required |
|---|---|---|---|
| Business Name | `name` | `companies.name` | **Yes** |
| Website / Domain | `domain` | `companies.website` | No |
| Phone | `phone` | `companies.phone` | No |
| Street Address | `address` | `companies.address_line_1` | No |
| City | `city` | `companies.city` | No |
| State / Region | `state` | `companies.state` | No |
| ZIP / Postal Code | `zip` | `companies.zip` | No |
| Country | `country` | `companies.country` | No |
| Google Rating | `google_rating` | `company_ratings.rating` (channel `google`) | No |
| Review Count | `google_review_count` | `company_ratings.review_count` (channel `google`) | No |
| *(static)* | `hs_lead_status` | `companies.lead_status` | No (defaults `New`) |
| *(static)* | `gs_company_type` | `companies.company_type` | No (defaults `Property`) |
| *(static)* | `gs_property_type` | `property_details.property_type` | No (left blank if unrecognized) |
| *(static, optional)* | `source` | `companies.source` — free text, no fixed list | No (defaults `google_maps`) |

Enum fields are matched **case-insensitively** against the lists below; an unrecognized
value falls back to the default rather than erroring the whole record.

- `gs_company_type` → one of: `Property`, `Management Company`, `Ownership Company`,
  `Operator`, `Hotel Group / Portfolio`, `STR Management Company`, `Other`. Default: `Property`.
- `gs_property_type` → one of: `Hotel`, `Resort`, `Boutique Hotel`, `Aparthotel`,
  `Serviced Apartment`, `STR / Vacation Rental`, `B&B / Inn`, `Hostel`, `Other`. Default: blank
  (left for a human to classify).
- `hs_lead_status` → one of: `New`, `Researching`, `Needs Review`, `Qualified`,
  `Decision Maker Needed`, `Ready for Outreach`, `Outreach Active`, `Engaged`, `Nurture`,
  `Unqualified`. Default: `New`.

`companies.source` has no fixed list of allowed values (matches `signal_type`/`pain_type`
elsewhere in this schema) — send anything descriptive (`"google_maps"`, `"import"`, a
campaign name, etc.), or omit it and it defaults to `google_maps`.

## What happens on the server

**No deduplication — every valid record is inserted as a new company.** This was tried
(matching by domain, then by domain+name) and dropped: chain-affiliated properties often
share one generic corporate domain (e.g. `hilton.com`) across many genuinely different
physical hotels, which caused real distinct hotels to collide and overwrite each other.
`companies.website` is not unique at the DB level for the same reason (migration 0005).

**Practical implication: re-sending the same hotel creates a second row.** If gscraper
re-scrapes the same listing later, that's a duplicate company in the CRM, not an update.
Handle repeat-avoidance on the gscraper side (e.g. don't re-submit a listing already sent)
until we have a reliable per-record identifier (see Known Limitations).

For each record:

1. **Validate** — `name` is required. Missing → that record is skipped (with a reason), the
   rest of the batch still processes.
2. **Create** — inserts the company (`source` from the payload or `google_maps` by default,
   `lifecycle_stage: Prospect`), and if `company_type` is `Property`, also creates its
   `property_details` row (`portfolio_role: Independent` by default).
3. **Rating** — if `google_rating` or `google_review_count` is present, inserts a
   `company_ratings` row for channel `google` on the new company.

## Response

```json
{
  "created": 2,
  "skipped": 0,
  "results": [
    { "index": 0, "status": "created", "company_id": 13 },
    { "index": 1, "status": "created", "company_id": 23 }
  ]
}
```

- Always `200` if the request itself was well-formed and authenticated — per-record
  failures show up in `results[].status: "skipped"` with an `error` message, they don't
  fail the whole batch.
- `400` — malformed body (no `name` and no `hotels` array) or batch over 500 records.
- `401` — missing/incorrect `Authorization` header.

## Example calls

```bash
# Single record
curl -X POST https://<your-domain>/api/integrations/google-maps/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <INGEST_API_KEY>" \
  -d '{
    "name": "The Gotham Hotel",
    "domain": "thegothamhotelny.com",
    "google_rating": "4.3",
    "google_review_count": "830",
    "hs_lead_status": "NEW",
    "gs_company_type": "Property",
    "gs_property_type": "Boutique Hotel"
  }'

# Batch
curl -X POST https://<your-domain>/api/integrations/google-maps/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <INGEST_API_KEY>" \
  -d '{ "hotels": [ { "name": "Hotel A", "domain": "a.com" }, { "name": "Hotel B", "domain": "b.com" } ] }'
```

## Known limitations (not built yet)

- **No rate limiting** — fine for one trusted internal caller; would need real infra
  (e.g. Upstash/Redis) before this is exposed more broadly.
- **No per-caller API keys** — one shared secret for the whole integration.
- **No dedup at all, by design** — see above. If repeat-scrapes of the same listing become
  a real problem, the fix is a `google_place_id` column (Google's own unique per-listing
  ID, which gscraper doesn't currently send) rather than resurrecting website/name matching.

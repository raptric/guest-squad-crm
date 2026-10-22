# gscraper update — send campaign details to Guest Squad CRM

**Goal:** every time gscraper pushes hotels to the CRM, also send which *campaign* the run
belongs to (ID, name, target country/state/city, notes). The CRM groups the companies into a
batch so we always know where they came from. Nothing else about the push changes.

## 1. The endpoint (unchanged)

```
POST https://crm.guestsquad.com/api/integrations/google-maps/import
Content-Type: application/json
Authorization: Bearer <INGEST_API_KEY>
```

Keep the existing URL, key and field mappings. Full field reference:
`docs/integrations/google-maps-import.md`.

## 2. What to add

Add these six fields to every record gscraper sends. They describe the **campaign**, so they
are the **same on every hotel of the run** — set them as static / run-level values that the
operator fills in when starting a campaign, not values scraped from Google Maps.

| Field | Required | Example | Notes |
|---|---|---|---|
| `campaign_id` | **Yes** (if any campaign field is sent) | `ny-manhattan-2026-10` | Unique per campaign, max 100 chars. Identical on every record of the run. |
| `campaign_name` | No | `NY Manhattan Properties` | Falls back to `campaign_id` |
| `campaign_country` | No | `United States` | Target country of the campaign |
| `campaign_state` | No | `NY` | Target state / region |
| `campaign_city` | No | `Manhattan` | Target city / area |
| `campaign_notes` | No | `Independent + boutique only, 3-5 stars` | Free text about the batch |

**Optional seventh field — closes the campaign:**

| Field | Example | Notes |
|---|---|---|
| `campaign_complete` | `true` | Send `true` **only on the campaign's final push**. Leave it out (or `false`) everywhere else. |

### Rules
1. **One `campaign_id` per campaign.** The first push with a new ID creates the batch in the CRM;
   every later push with the same ID joins it. Posting one hotel per request is fine.
2. **A new campaign = a new `campaign_id`.** Never reuse an ID for a different area or search.
3. **The first push defines the batch details.** Changing `campaign_name` / city / notes in
   later pushes of the same ID is ignored — don't rely on it to edit a batch.
4. **Don't mix these up with the hotel's own location.** `city` / `state` / `country` stay the
   hotel's address from Google Maps. `campaign_city` / `campaign_state` / `campaign_country` are
   only the area being targeted.
5. If any `campaign_*` field is sent **without** `campaign_id`, the CRM rejects that record
   (HTTP 400 for a single record; that record is `skipped` with an error inside a batch).
   If you send no campaign fields at all, behaviour is exactly as before.

### Closing the campaign automatically

When the campaign has pushed its last hotel, the CRM marks it **Completed** (shown on the Scraper
Monitor as "Closed by scraper"). Completed is permanent — **a campaign can't be reopened.**

1. Send `campaign_complete: true` on the **last record** (or last batch request) of the run, **or**
2. after the run finishes, send one extra **closing call** with no hotels:
   ```json
   { "campaign_id": "ny-manhattan-2026-10", "campaign_complete": true }
   ```
   Prefer this if pushes run in parallel or the last record can fail — it can't be skipped for a
   bad hotel name.

Rules for the flag:
- Send it only **after every other push of that campaign has finished** (wait for their responses).
  Hotels pushed after completion are still saved, but the response includes a `warnings` entry and
  the Scraper Monitor flags "received data after completed".
- If the run is stopped or fails halfway, **don't send the flag** — the campaign stays open and
  turns Stale after 24h without data, so someone checks it.
- Sending the flag twice is harmless. A completed `campaign_id` can't be reused for a new run —
  start a new campaign with a new ID.

## 3. Payload examples

**Single hotel per request (flat fields):**
```json
{
  "name": "The Gotham Hotel",
  "domain": "thegothamhotelny.com",
  "phone": "212.490.8500",
  "address": "16 East 46th Street",
  "city": "New York",
  "state": "NY",
  "zip": "10017",
  "country": "United States",
  "google_rating": "4.3",
  "google_review_count": "830",
  "campaign_id": "ny-manhattan-2026-10",
  "campaign_name": "NY Manhattan Properties",
  "campaign_country": "United States",
  "campaign_state": "NY",
  "campaign_city": "Manhattan",
  "campaign_notes": "Independent + boutique only"
}
```

**Many hotels per request (campaign sent once in a `batch` object):**
```json
{
  "batch": {
    "campaign_id": "ny-manhattan-2026-10",
    "campaign_name": "NY Manhattan Properties",
    "country": "United States",
    "state": "NY",
    "city": "Manhattan",
    "notes": "Independent + boutique only"
  },
  "hotels": [
    { "name": "Hotel A", "domain": "a.com", "city": "New York" },
    { "name": "Hotel B", "domain": "b.com", "city": "New York" }
  ]
}
```
Max 500 hotels per request. Use whichever shape gscraper already uses; both are accepted.

## 4. What a good response looks like

```json
{
  "created": 2, "skipped": 0,
  "batch": { "batch_id": 3, "campaign_id": "ny-manhattan-2026-10", "status": "open", "companies_in_batch": 2 },
  "results": [ { "index": 0, "status": "created", "company_id": 2860, "batch_id": 3 } ]
}
```
- `batch` in the response = campaign details were received and recorded. `companies_in_batch`
  is the running total for that campaign.
- `401` = wrong/missing key. `400` with `campaign_id is required…` = campaign fields sent
  without an ID.

## 5. Quick check with curl (before changing gscraper)

```bash
curl -X POST https://crm.guestsquad.com/api/integrations/google-maps/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <INGEST_API_KEY>" \
  -d '{"name":"ZZ Test Hotel","campaign_id":"zz-curl-test","campaign_name":"ZZ Curl Test","campaign_city":"Manhattan"}'
```
Expect `"created": 1` and a `batch` block. Tell the CRM owner so the test record can be deleted.

## 6. Acceptance checklist

- [ ] The operator can set the six campaign values once per run (not per hotel).
- [ ] Every pushed record carries the same `campaign_id` for that run.
- [ ] Hotel address fields (`city`/`state`/`country`) are unchanged and still come from Google Maps.
- [ ] A test run of ≤3 hotels returns a `batch` block with the right `companies_in_batch`.
- [ ] The last push (or the closing call) carries `campaign_complete: true` and the response shows `"status": "completed"`.
- [ ] No hotel is pushed after the flag is sent.
- [ ] CRM owner confirms the batch and its companies in the database, then deletes the test data.

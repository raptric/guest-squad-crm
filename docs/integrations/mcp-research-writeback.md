# MCP Research Writeback (Phase 2) — Integration Guide

Completes the read-only Phase 1 contract (`list_companies` / `get_company`) with safe,
production-ready writeback, so this MCP can replace the HubSpot connector for research.

- **Source:** [src/app/api/mcp/route.ts](../../src/app/api/mcp/route.ts)
- **Supporting modules:** [src/lib/mcp/](../../src/lib/mcp/) (`canonicalResult.ts`, `applyResearch.ts`,
  `matching.ts`, `offerMapping.ts`, `audit.ts`), [src/lib/db.ts](../../src/lib/db.ts)

No existing tool was removed or changed in a breaking way. Everything below is additive.

## ⚠️ The canonical `canonical_result` field names are this MCP's own interpretation

The 10 top-level keys (`property_profile`, `identity`, `ownership`, `reputation`, `pain`,
`hiring_signal`, `qualification`, `contacts`, `portfolio_discovery`, `system_output`) are fixed,
per the writeback spec, and this code never renames them.

**The fields *inside* each section are not defined anywhere in this repository or in the
installed `guestsquad-prospect-research` skill.** That skill (`~/.claude/skills/guestsquad-prospect-research/SKILL.md`)
renders two markdown tables for chat — it does not emit this JSON shape at all. No other file in
this environment defines a JSON schema for `canonical_result`.

The field names documented below were inferred from the "Company And Research Mapping" table and
the other prose sections of the writeback request, using this repo's existing snake_case
conventions. **Before relying on this in production, whoever owns the actual research
runner/engine should confirm these names match its real output — or the runner should be adjusted
to emit this shape.** `apply_research_result` parses defensively: an unrecognized shape inside a
section produces a `warnings` entry rather than silently doing nothing or throwing, so a mismatch
is loud on the very first real call. See `src/lib/mcp/canonicalResult.ts` for the exact parsing
logic (it's the single source of truth — this doc mirrors it, not the other way around).

```jsonc
{
  "property_profile": {
    "website": "https://...", "phone": "...",
    "address_line_1": "...", // or "address"
    "city": "...", "state": "...", "zip": "...", // or "postal_code"
    "country": "...",
    "company_type": "...",      // picklist-validated; only used to flag a mismatch, never auto-changes an existing record's type
    "property_type": "...", "property_class": "...", "rooms_units": 88, "portfolio_role": "..."
  },
  "identity": { "status": "...", "confidence": "...", "notes": "..." },
  "ownership": {
    "ownership_entity": "...", "operating_entity": "...", "management_entity": "...",
    "brand_name": "...", "primary_operating_parent": "...", "primary_parent_reason": "..."
  },
  "reputation": {
    // keyed by channel (google | booking_com | tripadvisor | expedia | hotels_com | vrbo | airbnb | other)
    // or an array of { channel, ... } entries -- both accepted. Only rating/review_count are
    // stored on company_ratings; native_scale/listing_url/notes/confidence, if sent, are still
    // preserved verbatim in mcp_audit_log's stored request, just not duplicated onto the row.
    "google": { "rating": 4.2, "review_count": 310 }
  },
  "pain": [ // or { "signals": [...] }, or a single flat object
    { "pain_type": "Calls", "source_url": "..." }
  ],
  "hiring_signal": [ // or { "signals": [...] }, or a single flat object
    { "role": "Front Desk / Reception", "job_title": "...", "strength": "Medium", "source_url": "..." }
  ],
  "qualification": {
    "outcome": "Qualified",       // "Qualified" | "Needs Review" | "Disqualified"
    "reason": "...",              // -> qualification_summary
    "priority_tier": "Tier 1",
    "why_now_hook": "...",        // -> sdr_signal_summary
    "research_complete": true,
    "needs_human_review": false
  },
  "contacts": [
    {
      "name": "Pat Rivera",           // or first_name/last_name directly
      "title": "General Manager",     // or "job_title"
      "email": "pat@hotel.example", "email_verified": true,
      "phone": "...", "phone_type": "Work",
      "linkedin_url": "...",
      "contact_role": "General Manager", "decision_maker_level": "Primary Decision Maker",
      "source_url": "...", "evidence": "..."
    }
  ],
  "portfolio_discovery": {
    "primary_operating_parent": { "name": "...", "website": "...", "city": "...", "country": "..." },
    "siblings": [ { "name": "...", "website": "...", "city": "...", "state": "...", "country": "...", "phone": "...", "address": "..." } ],
    "confirmed_size": 12 // only applied when the researched company_id itself is a portfolio/group, not a Property
  },
  "system_output": {
    "confidence_notes": "...",       // or "notes"
    "research_complete": true,       // accepted here too, as a fallback if not under qualification
    "needs_human_review": false,
    "sales_signals": [ { "signal_type": "...", "strength": "...", "source_url": "..." } ]
  }
}
```

`confidence`/`native_scale`/`listing_url`/`notes` fields are accepted wherever a research runner
sends them but are not stored on any domain table — they're preserved verbatim in
`mcp_audit_log`'s stored `request` JSON for that call instead of being spread as extra columns
across `company_ratings`/`property_pain_signals`/`company_hiring_signals`/`company_signals`/
`contact_companies`/`contact_emails`/`contact_phones` (an earlier version of this feature did add
those columns; they were removed — see migration `0018` — in favor of the audit log being the
one place that data lives).

## Write rules actually enforced

- **Fill blanks, never overwrite a known value.** A value counts as "known" unless it's `null`,
  empty, or the literal string `"Unknown"`/`"N/A"`/`"None"` (any casing) — see `isBlankFact` /
  `mergeFact` in `canonicalResult.ts`. This applies to every profile/relationship field. There is
  no per-field confidence tracked on the `companies` table, so "known beats known" is resolved by
  always keeping the existing value — the safe default.
- **Research metadata is refreshed, not preserved** (`identity_*`, `confidence_notes`,
  `research_complete`, `qualification_summary`, `sdr_signal_summary`, `prospect_tier`,
  `last_researched`) — it represents the *current* state of research, not a static fact. An
  omitted field is left untouched; a present-but-blank one is not written over an existing value.
  `last_researched` is always server-set (`now()`), never trusted from the payload.
- **Ratings are upserted per `(company_id, channel)`**, always refreshed with the new
  rating/review_count when provided (reputation is time-series data, not a static fact). Only
  `rating`/`review_count`/`captured_at` are stored — no scale-conversion problem to worry about
  since no other rating field is persisted at all.
- **Pain/hiring/sales signals are deduped** (by `pain_type`, by `role`, and by `signal_type`
  respectively); their pre-existing `source_url` column fills blanks the same fill-blanks way.
- **Contacts** are only created/updated when a name, a real email, `email_verified` is not
  `false`, and a `source_url` or `evidence` are all present; a generic-looking inbox
  (`info@`, `sales@`, `reservations@`, ...) is rejected. Matching, merge-without-clobbering-
  verified-data, and add-only emails/phones reuse the exact same rules as the Phase-1
  `find_or_create_contact` tool (`src/lib/contacts.ts`). Two existing contacts sharing the
  submitted email → skipped with a warning, never auto-merged.
- **Qualification → lead_status/lifecycle_stage**, incomplete-research rule first: if
  `research_complete === false`, `lead_status` becomes `Needs Review` regardless of `outcome`.
  Otherwise `Qualified` → `Qualified` + `Sales Qualified`; `Needs Review`/`Disqualified` → that
  `lead_status` only, lifecycle untouched. No deal/opportunity/customer/outreach row is ever
  created here.
- **Parent/siblings** reuse `search_companies`' own scoring (`src/lib/mcp/matching.ts`) run
  inside the same transaction. A confident single match is reused; more than one plausible match,
  or an existing conflicting parent, is left alone and reported under `parent.action` /
  `siblings.review_required` — never auto-resolved. A newly created sibling is always
  `Property` / `New` / `Lead`, and this function never recurses into researching it (one-hop
  only, matching the spec).
- **Offers, inside `apply_research_result`,** are only auto-suggested when the outcome is a
  clean `Qualified` with `research_complete !== false` and no review flag, mapped through
  `src/lib/mcp/offerMapping.ts` onto the *real* `offer_service` picklist (Settings) — never a
  hardcoded new value. **There is no human-vs-research provenance tracked on an offer record**
  (explicit decision): this auto-suggestion step always replaces whatever Primary/Secondary
  Offer is already set, including one a human chose. See "Known limitations" below. The
  standalone `add_offer_recommendation`/`remove_offer_recommendation` tools (below) don't
  auto-suggest anything — they're a direct, deliberate add/remove action, same as the CRM UI.

## Offer mapping is this MCP's own config, not research-runner output

The writeback request suggested Offer names (`Hotel Answering Service`, `OTA Inbox Management`,
...) that do not exist in this CRM's real `offer_service` picklist (`After-hours Guest Support`,
`Reservations`, `Full Guest Operations`, `Overflow Coverage`, `Front Desk Support`,
`OTA / Messaging`, `Pilot`, `Other`). Per the explicit instruction not to hardcode new picklist
values, `offerMapping.ts` remaps each suggested category onto the closest *real* value, and
leaves anything with no confident real equivalent (vacation-rental/Airbnb-specific, maintenance
escalation, generic cost/staffing efficiency) unmapped on purpose. Always call
`list_offer_options` and validate against it — never assume the mapping's target values still
exist.

The evidence→offer mapping runs on a small internal tag vocabulary
(`deriveEvidenceTags` in `offerMapping.ts`), derived conservatively from the pain/hiring/portfolio
data this MCP already parses. It's deliberately narrow (a miss just means no suggestion; a false
positive would mis-categorize a real lead). Edit `offerMapping.ts` directly to extend it —
`OFFER_MAPPING_VERSION` is folded into the `rationale` text on every auto-assigned
`offer_recommendations` row (no dedicated column) so a mapping change stays traceable against
historical suggestions.

## Atomicity: this requires `DATABASE_URL` to be set on every environment that runs this route

Every other tool in this file talks to Supabase over PostgREST (`createAdminClient()`), where
each `.from().insert()`/`.update()` call is its own independent request — there is no way to
group several of them into one database transaction that way. `apply_research_result` needs true
atomicity, so it opens a **direct Postgres connection** via the `pg` package
(`src/lib/db.ts`'s `withTransaction`, `@types/pg` added as a dev dependency) and runs a real
`BEGIN`/`COMMIT`/`ROLLBACK` inside it — including a `SELECT ... FOR UPDATE` row lock on the
target company for the duration of the transaction.

`DATABASE_URL` was already a documented env var (`.env.example`) used by the local migration/seed
scripts, but until now the *deployed app itself* never opened a direct Postgres connection at
runtime — only Supabase's REST API. **Before this ships to production, confirm `DATABASE_URL` is
set on Vercel** with the same pooler connection string used locally; if it's missing,
`apply_research_result` will fail (and its `mcp_audit_log` row will correctly show `status:
'failed'`) while every other tool keeps working normally.

## Idempotency and audit (`mcp_audit_log`, migration `0017`; evidence columns reverted in `0018`)

`idempotency_key` is required on `apply_research_result`. A dedicated table enforces it:

1. **Reserve** — a plain `INSERT ... status='in_progress'` with a unique index on
   `idempotency_key`. The unique constraint *is* the mutex: a second concurrent call with the
   same key gets `unique_violation` and is told `"blocked"` rather than racing the first one. A
   reservation stuck `in_progress` for more than 5 minutes (a crashed process) is treated as
   abandoned and retried rather than blocking forever.
2. **Work** — the real transaction runs, and its very last statement (still inside the same
   transaction) flips that row to `applied`/`needs_review` with the full response, so success and
   its audit record commit atomically together.
3. **Replay** — a later call with the same key finds the row already `applied`/`needs_review` and
   returns the *stored* response verbatim (`status: 'already_applied'` on the wire; the row's own
   stored status is left as the original outcome) — no re-execution, so no duplicates.
4. **Failure** — if the transaction throws, it rolls back (nothing written), and a separate,
   already-`.end()`-safe connection marks that same row `failed` with the error, so the key is
   both visible and retryable.

`add_offer_recommendation`/`remove_offer_recommendation` and every pre-existing mutating tool
also write a row (via `recordSimpleAudit`, no idempotency key needed there) — nothing bypasses
`mcp_audit_log`. The pre-existing `activities`-table logging (visible on the Company detail
page's timeline) is untouched and kept in parallel for the UI.

## New tools

Offers deliberately mirror the CRM's own UI (`AddOfferForm`/`OfferList`,
`src/app/(app)/companies/[id]/add-offer-form.tsx` and `offer-list.tsx`) instead of inventing a
different interaction model: add one recommendation at a time through the same two dropdowns
(service, type), remove one at a time, and let the same database constraints
(`offer_recommendations`'s `UNIQUE(company_id, service)` and the partial unique index limiting
one `Primary` per company) produce the same errors the UI's own API route already surfaces.

| Tool | Mutates? | Notes |
|---|---|---|
| `search_companies` | No | Weighted, explainable match scoring (`matching.ts`) — website domain, normalized name, phone, address, city+country, shared parent. `ambiguous: true` when more than one non-Low candidate exists. |
| `list_offer_options` | No | `service_options` (the live `offer_service` picklist) and `type_options` (always `["Primary","Secondary"]`) — one for each of the CRM form's two dropdowns. |
| `add_offer_recommendation` | Yes | `company_id, service, type, rationale?`. A second Primary, or a duplicate service, is rejected with the same message the CRM UI gives (`23505` → a friendly error), not silently merged or overwritten. |
| `remove_offer_recommendation` | Yes | `company_id, service`. Idempotent: removing something that isn't there returns `status: "not_found"`, not an error. |
| `apply_research_result` | Yes | See above — its own internal offer-auto-suggestion step is separate from these two tools and still uses upsert/replace semantics, since it's the sanctioned one-call writeback path, not a UI-mirroring action. |

## Known limitations, called out explicitly

- **No protection against `apply_research_result`'s auto-suggestion overwriting a human's own
  Offer choice.** An earlier version of this feature tracked a `source` column (`human` vs
  `research_auto`) on `offer_recommendations` specifically to prevent this; it was removed by
  explicit request (no new columns on existing tables). `apply_research_result`'s internal
  auto-suggestion step now unconditionally replaces whatever Primary/Secondary Offer is already
  set. (`add_offer_recommendation`/`remove_offer_recommendation` don't have this problem at all —
  they never silently overwrite anything; a conflicting add is rejected, exactly like the UI.) If
  protection for the auto-suggestion path needs to come back, it would need to live somewhere
  that isn't a new column — e.g. inferred from `mcp_audit_log`'s history for that company, which
  is slower per call and can't say anything
  about an offer that predates this audit log.
- **`company_type` in `property_profile` is never applied** — only validated and, if it disagrees
  with the existing record, reported as a warning. Changing a record's fundamental type from a
  research pass was judged too risky to automate.
- **No formal test suite** — this was verified against the 14-point acceptance list manually,
  against a disposable test company created and deleted in the shared dev/prod database (see the
  session log), not via an automated test file.

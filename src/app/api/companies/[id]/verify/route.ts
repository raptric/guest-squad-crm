import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { withTransaction } from "@/lib/db";
import { applyVerifiedRule } from "@/lib/pipeline";
import {
  VERIFICATION_INCOMPLETE,
  VERIFICATION_READY,
  verificationLabel,
  VERIFY_FIELD_LABELS,
} from "@/lib/verification";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Records a human review of an AI-researched company and sets its verification_status.
//   { has_errors: false }                              -> Ready for Outreach
//   { has_errors: true, fields: [...], fixed_all: true }  -> Ready for Outreach
//   { has_errors: true, fields: [...], fixed_all: false } -> Qualified - Incomplete
// lead_status is never touched. A Ready for Outreach result also runs the "when verified" pipeline rule from Settings.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const reviewer = await getCurrentUser();
  if (!reviewer) return fail("Unauthorized", 401);

  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid company id");

  const body = (await request.json()) as {
    has_errors?: unknown;
    fields?: unknown;
    fixed_all?: unknown;
    notes?: unknown;
  };
  if (typeof body.has_errors !== "boolean") return fail("has_errors must be true or false");

  let fields: string[] = [];
  let fixedAll: boolean | null = null;
  if (body.has_errors) {
    if (!Array.isArray(body.fields) || body.fields.length === 0) return fail("Tick at least one incorrect field");
    fields = [...new Set(body.fields.map(String))];
    const unknown = fields.filter((f) => !(f in VERIFY_FIELD_LABELS));
    if (unknown.length) return fail(`Unknown field: ${unknown.join(", ")}`);
    if (typeof body.fixed_all !== "boolean") return fail("fixed_all must be true or false");
    fixedAll = body.fixed_all;
  }

  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length > 2000) return fail("Notes must be 2000 characters or fewer");

  const outcome = body.has_errors && fixedAll === false ? VERIFICATION_INCOMPLETE : VERIFICATION_READY;

  const result = await withTransaction(async (client) => {
    const company = (await client.query("SELECT c.id, c.lead_status, c.verification_status, ps.name AS status_name FROM companies c LEFT JOIN pipeline_statuses ps ON ps.id = c.pipeline_status_id WHERE c.id = $1 AND c.deleted_at IS NULL FOR UPDATE OF c", [id])).rows[0];
    if (!company) return { error: "Company not found", status: 404 };
    // Already-verified companies can be re-verified even if the rule has since moved them past Qualified.
    if (company.lead_status !== "Qualified" && company.status_name !== "Qualified" && company.verification_status === null) return { error: "Only Qualified companies can be verified", status: 400 };

    const review = (
      await client.query(
        `INSERT INTO company_reviews (company_id, reviewer_id, reviewer_name, outcome, had_errors, fixed_all, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [id, reviewer.id, reviewer.name, outcome, body.has_errors, fixedAll, notes || null]
      )
    ).rows[0];
    if (fields.length) {
      await client.query("INSERT INTO company_review_fields (review_id, field_key) SELECT $1, unnest($2::text[])", [review.id, fields]);
    }
    await client.query("UPDATE companies SET verification_status = $1 WHERE id = $2", [outcome, id]);

    // Same note shows in the company's activity timeline so the whole team sees it.
    const summary = [
      `Verification: ${verificationLabel(outcome)}.`,
      body.has_errors
        ? `Errors in: ${fields.map((f) => VERIFY_FIELD_LABELS[f]).join(", ")}. ${fixedAll ? "Reviewer fixed all errors." : "Some errors could not be fixed."}`
        : "No errors found.",
      notes ? `Notes: ${notes}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    await client.query(
      `INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body, metadata)
       VALUES ($1, 'qualification', 'human', $2, $3, $4)`,
      [id, reviewer.name, summary, JSON.stringify({ review_id: review.id, outcome, fields })]
    );
    const movedTo = outcome === VERIFICATION_READY ? await applyVerifiedRule(client, reviewer, Number(id)) : null;
    return { review_id: Number(review.id), moved_to: movedTo };
  });

  if ("error" in result) return fail(result.error as string, result.status as number);
  return NextResponse.json({ ok: true, verification_status: outcome, review_id: result.review_id, moved_to: result.moved_to });
}

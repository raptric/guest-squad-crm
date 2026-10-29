import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/ai/content";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// The people on file at a company, for the preview's contact picker. Admin only.   GET ?company_id=
export async function GET(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return fail("Only admins can preview prompts.", 403);

  const id = new URL(request.url).searchParams.get("company_id");
  if (!id || !/^\d+$/.test(id)) return fail("Choose a company.");

  const contacts = await query<{ id: string; name: string; job_title: string | null }>(
    `SELECT ct.id::text, trim(ct.first_name || ' ' || coalesce(ct.last_name, '')) AS name, ct.job_title
       FROM contacts ct JOIN contact_companies cc ON cc.contact_id = ct.id
      WHERE cc.company_id = $1 AND ct.deleted_at IS NULL ORDER BY ct.decision_maker_level = 'Primary Decision Maker' DESC, ct.id LIMIT 30`,
    [id],
  );
  return NextResponse.json({ contacts });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPicklistValues } from "@/lib/picklists";
import { getCurrentUser } from "@/lib/current-user";
import { query as dbQuery } from "@/lib/db";
import { visibleSql } from "@/lib/visibility";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const excludeId = searchParams.get("exclude");

  const allCompanyTypes = await fetchPicklistValues(supabase, "company_type");
  // Default: only portfolio-capable types (parent-company picker). all=1: every company.
  const searchAll = searchParams.get("all") === "1";
  const searchTypes = searchAll ? allCompanyTypes : allCompanyTypes.filter((t) => t !== "Property");

  // Only companies this person may see.
  const actor = await getCurrentUser();
  const params: unknown[] = [searchTypes];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = ["c.deleted_at IS NULL", "c.company_type = ANY($1)", visibleSql(actor, "c", add)];
  if (q) where.push(`c.name ILIKE ${add(`%${q.replace(/[\\%_]/g, "\\$&")}%`)}`);
  if (excludeId && /^\d+$/.test(excludeId)) where.push(`c.id <> ${add(Number(excludeId))}`);

  const data = await dbQuery<{ id: number; name: string; company_type: string }>(
    `SELECT c.id::int AS id, c.name, c.company_type FROM companies c WHERE ${where.join(" AND ")} ORDER BY c.name LIMIT 10`,
    params
  );

  return NextResponse.json({ companies: data });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPicklistValues } from "@/lib/picklists";

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
  const portfolioCapableTypes = allCompanyTypes.filter((t) => t !== "Property");

  let query = supabase
    .from("companies")
    .select("id, name, company_type")
    .in("company_type", portfolioCapableTypes)
    .is("deleted_at", null)
    .order("name")
    .limit(10);

  if (q) query = query.ilike("name", `%${q}%`);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ companies: data });
}

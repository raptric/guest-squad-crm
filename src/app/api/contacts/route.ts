import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCompanyIds } from "@/lib/contacts";
import { createContactForCompanies } from "./create";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  return createContactForCompanies(supabase, parseCompanyIds(body.company_ids), body);
}

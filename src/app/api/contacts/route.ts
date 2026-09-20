import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createContactForCompany } from "./create";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const companyId = parseInt(String(body.company_id ?? ""), 10);
  if (!companyId) return NextResponse.json({ error: "Select a company for this contact" }, { status: 400 });

  return createContactForCompany(supabase, companyId, body);
}

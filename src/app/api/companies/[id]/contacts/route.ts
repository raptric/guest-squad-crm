import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createContactForCompany } from "@/app/api/contacts/create";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return createContactForCompany(supabase, Number(id), await request.json());
}

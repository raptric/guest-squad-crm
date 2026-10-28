import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { companyAccessError } from "@/lib/visibility";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; offerId: string }> }
) {
  const { id, offerId } = await params;
  const denied = await companyAccessError(id);
  if (denied) return denied;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase.from("offer_recommendations").delete().eq("id", offerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

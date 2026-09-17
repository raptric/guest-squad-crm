import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { channel, rating, review_count } = await request.json();

  if (!channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("company_ratings")
    .upsert(
      {
        company_id: Number(id),
        channel,
        rating: rating === "" || rating === undefined ? null : parseFloat(rating),
        review_count: review_count === "" || review_count === undefined ? null : parseInt(review_count, 10),
        captured_at: new Date().toISOString(),
      },
      { onConflict: "company_id,channel" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rating: data }, { status: 201 });
}

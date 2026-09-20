import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHumanActor } from "./actor";
import { createContact } from "./create";

export async function POST(request: Request) {
  const supabase = await createClient();
  const actor = await getHumanActor(supabase);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return createContact(supabase, await request.json(), actor);
}

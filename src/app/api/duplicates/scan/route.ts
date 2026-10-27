import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { canAssign } from "@/lib/assignment";
import { scanDuplicates } from "@/lib/duplicates";

// "Check for duplicates": scans the companies the viewer can reach and returns the groups of copies.
// Admins scan everything; team leads only their team's companies.
export async function POST() {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAssign(actor)) return NextResponse.json({ error: "Only admins and team leads can check for duplicates." }, { status: 403 });

  const result = await scanDuplicates(actor);
  return NextResponse.json({ ...result, scanned_at: new Date().toISOString() });
}

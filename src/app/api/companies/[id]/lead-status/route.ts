import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPicklistValues } from "@/lib/picklists";

// A lightweight, single-field update for the Review Queue's inline actions -- the full
// PATCH /api/companies/[id] route requires name+company_type on every call, which is overkill
// for "just move this lead's status." Applies the same rule Codex's MCP tool uses: Qualified
// also advances lifecycle_stage to "Sales Qualified"; every other status leaves it unchanged.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lead_status } = await request.json();
  const validStatuses = await getPicklistValues("lead_status");
  if (!validStatuses.includes(lead_status)) {
    return NextResponse.json({ error: `Invalid lead_status. Allowed: ${validStatuses.join(", ")}` }, { status: 400 });
  }

  const fields: Record<string, string> = { lead_status };
  if (lead_status === "Qualified") fields.lifecycle_stage = "Sales Qualified";

  const { error } = await supabase.from("companies").update(fields).eq("id", id).is("deleted_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: Number(id), ...fields });
}

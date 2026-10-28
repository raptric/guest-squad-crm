import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { campaignVisibleSql } from "@/lib/campaigns";
import { duplicateCampaign } from "@/lib/campaign-save";

// Copy a campaign you can see. The copy is your own Private Draft (details, steps and messaging; no enrollments).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });

  const sqlParams: unknown[] = [id];
  const add = (v: unknown) => {
    sqlParams.push(v);
    return `$${sqlParams.length}`;
  };
  const [visible] = await query<{ id: string }>(`SELECT k.id FROM campaigns k WHERE k.id = $1 AND ${campaignVisibleSql(actor, "k", add)}`, sqlParams);
  if (!visible) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  return NextResponse.json(await duplicateCampaign(Number(id), actor.id), { status: 201 });
}

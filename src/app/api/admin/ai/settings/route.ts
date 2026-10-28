import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { isProviderId } from "@/lib/ai/providers";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Choose the provider the CRM uses and the per-person daily limit. Admin only.
//   { active_provider?: "anthropic" | "openai" | null }
//   { daily_limit?: number }
export async function PATCH(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can change AI settings.", 403);

  const body = (await request.json().catch(() => ({}))) as { active_provider?: unknown; daily_limit?: unknown };
  if (body.active_provider === undefined && body.daily_limit === undefined) return fail("Nothing to change.");

  if (body.active_provider !== undefined) {
    if (body.active_provider !== null && !isProviderId(body.active_provider)) return fail("Unknown provider.");
    if (body.active_provider !== null) {
      const [p] = await query<{ has_key: boolean; model: string }>("SELECT api_key_enc IS NOT NULL AS has_key, model FROM ai_providers WHERE provider = $1", [body.active_provider]);
      if (!p?.has_key) return fail("Save an API key for that provider first.");
      if (!p.model) return fail("Choose a model for that provider first.");
    }
    await query("UPDATE ai_settings SET active_provider = $1, updated_at = now() WHERE id = 1", [body.active_provider]);
  }

  if (body.daily_limit !== undefined) {
    const n = Number(body.daily_limit);
    if (!Number.isInteger(n) || n < 1 || n > 1000) return fail("The daily limit must be a whole number from 1 to 1000.");
    await query("UPDATE ai_settings SET daily_limit = $1, updated_at = now() WHERE id = 1", [n]);
  }
  return NextResponse.json({ ok: true });
}

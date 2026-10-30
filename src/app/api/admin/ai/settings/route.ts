import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { isProviderId } from "@/lib/ai/providers";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Choose the provider the CRM uses and the per-person daily limit. Admin only.
//   { active_provider?: "anthropic" | "openai" | null }
//   { writing_enabled?: boolean }   the master switch for AI writing
//   { daily_limit?: number }
//   { variants?: 1 | 2 | 3, creativity?: "low" | "medium" | "high" }   how many versions to write, and how varied
export async function PATCH(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can change AI settings.", 403);

  const body = (await request.json().catch(() => ({}))) as { writing_enabled?: unknown; active_provider?: unknown; daily_limit?: unknown; variants?: unknown; creativity?: unknown };
  if (body.writing_enabled === undefined && body.active_provider === undefined && body.daily_limit === undefined && body.variants === undefined && body.creativity === undefined) return fail("Nothing to change.");

  if (body.writing_enabled !== undefined) {
    if (typeof body.writing_enabled !== "boolean") return fail("Writing must be on or off.");
    await query("UPDATE ai_settings SET writing_enabled = $1, updated_at = now() WHERE id = 1", [body.writing_enabled]);
  }
  if (body.variants !== undefined) {
    const n = Number(body.variants);
    if (!Number.isInteger(n) || n < 1 || n > 3) return fail("Versions per click must be 1, 2 or 3.");
    await query("UPDATE ai_settings SET variants = $1, updated_at = now() WHERE id = 1", [n]);
  }
  if (body.creativity !== undefined) {
    if (body.creativity !== "low" && body.creativity !== "medium" && body.creativity !== "high") return fail("Creativity must be low, medium or high.");
    await query("UPDATE ai_settings SET creativity = $1, updated_at = now() WHERE id = 1", [body.creativity]);
  }

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

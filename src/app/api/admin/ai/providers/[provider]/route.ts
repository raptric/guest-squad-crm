import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { aiSecretConfigured, encryptKey } from "@/lib/ai/crypto";
import { isProviderId } from "@/lib/ai/providers";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Save a provider's API key and/or model. Admin only.
//   { api_key?: string }     a new key (blank = leave the saved one alone)
//   { clear_key?: true }     remove the saved key
//   { model?: string }
export async function PATCH(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can change AI settings.", 403);
  const { provider } = await params;
  if (!isProviderId(provider)) return fail("Unknown provider.", 404);

  const body = (await request.json().catch(() => ({}))) as { api_key?: unknown; clear_key?: unknown; model?: unknown };
  const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : undefined;
  const clear = body.clear_key === true;
  if (!apiKey && !clear && model === undefined) return fail("Nothing to change.");

  if (apiKey) {
    if (!aiSecretConfigured()) return fail("This server has no AI_KEY_SECRET, so a key can't be saved here. Add it to the environment settings first.", 500);
    if (apiKey.length < 20 || apiKey.length > 400 || /\s/.test(apiKey)) return fail("That doesn't look like a complete API key. Paste it again with no spaces.");
  }
  if (model !== undefined && (model.length > 100 || !/^[\w.:/-]*$/.test(model))) return fail("Model names use letters, numbers and . - _ : / only.");

  const sets: string[] = ["updated_at = now()", "updated_by = $1"];
  const values: unknown[] = [actor.id];
  const add = (sql: string, v: unknown) => {
    values.push(v);
    sets.push(`${sql} = $${values.length}`);
  };
  if (apiKey) {
    add("api_key_enc", encryptKey(apiKey));
    add("key_last4", apiKey.slice(-4));
  } else if (clear) {
    sets.push("api_key_enc = NULL", "key_last4 = NULL");
  }
  if (model !== undefined) add("model", model);
  values.push(provider);

  await query(`UPDATE ai_providers SET ${sets.join(", ")} WHERE provider = $${values.length}`, values);

  // A provider with no key can't stay the active one.
  if (clear) await query("UPDATE ai_settings SET active_provider = NULL, updated_at = now() WHERE id = 1 AND active_provider = $1", [provider]);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { AiError, generate, isProviderId } from "@/lib/ai/providers";
import { getProviderCredentials, logAiUsage } from "@/lib/ai/settings";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Send one tiny message to the chosen provider with its saved key and model, to prove they work. Admin only.
//   { provider }
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can test AI settings.", 403);

  const body = (await request.json().catch(() => ({}))) as { provider?: unknown };
  if (!isProviderId(body.provider)) return fail("Unknown provider.");
  const provider = body.provider;

  let creds: Awaited<ReturnType<typeof getProviderCredentials>>;
  try {
    creds = await getProviderCredentials(provider);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn't read the saved key.", 500);
  }
  if (!creds) return fail("Save an API key first.");
  if (!creds.model) return fail("Choose a model first.");

  try {
    const r = await generate(provider, creds.apiKey, creds.model, { prompt: "Reply with the single word OK.", maxTokens: 256 });
    // A connection that answers with nothing is not working, even though the service said yes.
    if (!r.text.trim()) {
      const message = "The model answered, but with an empty reply. Try again, or choose a different model.";
      await logAiUsage({ userId: actor.id, provider, model: creds.model, purpose: "test", inputTokens: r.inputTokens, outputTokens: r.outputTokens, ok: false, error: `empty reply (stop: ${r.stop ?? "unknown"})` });
      return fail(message, 502);
    }
    await logAiUsage({ userId: actor.id, provider, model: creds.model, purpose: "test", inputTokens: r.inputTokens, outputTokens: r.outputTokens, ok: true });
    return NextResponse.json({ ok: true, reply: r.text.trim().slice(0, 40), ms: r.ms });
  } catch (e) {
    const message = e instanceof AiError ? e.message : "The test failed.";
    await logAiUsage({ userId: actor.id, provider, model: creds.model, purpose: "test", ok: false, error: message });
    return fail(message, 502);
  }
}

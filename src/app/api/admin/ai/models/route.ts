import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { AiError, isProviderId, listModels } from "@/lib/ai/providers";
import { getProviderCredentials } from "@/lib/ai/settings";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// The model names the saved key can use, for the model dropdown. Admin only.   GET ?provider=anthropic|openai
export async function GET(request: Request) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Only admins can see AI settings.", 403);

  const provider = new URL(request.url).searchParams.get("provider");
  if (!isProviderId(provider)) return fail("Unknown provider.");

  try {
    const creds = await getProviderCredentials(provider);
    if (!creds) return fail("Save an API key first.");
    return NextResponse.json({ models: await listModels(provider, creds.apiKey) });
  } catch (e) {
    return fail(e instanceof AiError || e instanceof Error ? e.message : "Couldn't load the models.", 502);
  }
}

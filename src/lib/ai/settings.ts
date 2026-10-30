import { query } from "@/lib/db";
import { decryptKey } from "./crypto";
import { PROVIDER_IDS, type ProviderId } from "./providers";

export type ProviderSettings = { provider: ProviderId; hasKey: boolean; keyLast4: string | null; model: string; updatedAt: string | null };
export type AiSettings = { writingEnabled: boolean; activeProvider: ProviderId | null; dailyLimit: number; variants: number; creativity: "low" | "medium" | "high"; providers: ProviderSettings[] };

// What the Settings screen is allowed to see: never the key, only whether one is saved and its last four characters.
export async function fetchAiSettings(): Promise<AiSettings> {
  const [settings] = await query<{ active_provider: ProviderId | null; daily_limit: number; variants: number; creativity: "low" | "medium" | "high"; writing_enabled: boolean }>(
    "SELECT active_provider, daily_limit, variants, creativity, writing_enabled FROM ai_settings WHERE id = 1",
  );
  const rows = await query<{ provider: ProviderId; has_key: boolean; key_last4: string | null; model: string; updated_at: string | null }>(
    "SELECT provider, api_key_enc IS NOT NULL AS has_key, key_last4, model, updated_at FROM ai_providers",
  );
  return {
    writingEnabled: settings?.writing_enabled ?? false,
    activeProvider: settings?.active_provider ?? null,
    dailyLimit: settings?.daily_limit ?? 30,
    variants: settings?.variants ?? 2,
    creativity: settings?.creativity ?? "medium",
    providers: PROVIDER_IDS.map((p) => {
      const r = rows.find((x) => x.provider === p);
      return { provider: p, hasKey: r?.has_key ?? false, keyLast4: r?.key_last4 ?? null, model: r?.model ?? "", updatedAt: r?.updated_at ?? null };
    }),
  };
}

// For server code that is about to call the provider. Returns the decrypted key, so it must never reach a response.
export async function getProviderCredentials(provider: ProviderId): Promise<{ apiKey: string; model: string } | null> {
  const [row] = await query<{ api_key_enc: string | null; model: string }>("SELECT api_key_enc, model FROM ai_providers WHERE provider = $1", [provider]);
  if (!row?.api_key_enc) return null;
  return { apiKey: decryptKey(row.api_key_enc), model: row.model };
}

export type UsageRow = {
  id: string;
  created_at: string;
  user_name: string | null;
  provider: ProviderId;
  model: string;
  purpose: string;
  input_tokens: number | null;
  output_tokens: number | null;
  ok: boolean;
  error: string | null;
};

export async function logAiUsage(u: { userId: number | string | null; provider: ProviderId; model: string; purpose: string; inputTokens?: number | null; outputTokens?: number | null; ok: boolean; error?: string | null }) {
  await query("INSERT INTO ai_usage (user_id, provider, model, purpose, input_tokens, output_tokens, ok, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    u.userId,
    u.provider,
    u.model,
    u.purpose,
    u.inputTokens ?? null,
    u.outputTokens ?? null,
    u.ok,
    u.error ? u.error.slice(0, 300) : null,
  ]);
}

export async function fetchRecentUsage(limit = 25): Promise<UsageRow[]> {
  return query<UsageRow>(
    `SELECT a.id::text, a.created_at, u.name AS user_name, a.provider, a.model, a.purpose, a.input_tokens, a.output_tokens, a.ok, a.error
       FROM ai_usage a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.id DESC LIMIT $1`,
    [limit],
  );
}

export type UsageTotals = { calls_today: number; calls_30d: number; input_30d: number; output_30d: number };
export async function fetchUsageTotals(): Promise<UsageTotals> {
  const [r] = await query<UsageTotals>(
    `SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS calls_today,
            count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS calls_30d,
            coalesce(sum(input_tokens)  FILTER (WHERE created_at >= now() - interval '30 days'), 0)::int AS input_30d,
            coalesce(sum(output_tokens) FILTER (WHERE created_at >= now() - interval '30 days'), 0)::int AS output_30d
       FROM ai_usage`,
  );
  return r;
}

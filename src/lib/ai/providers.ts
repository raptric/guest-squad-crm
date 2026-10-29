// The one place that talks to the AI services. Server only: it receives a decrypted key and never returns it.

export type ProviderId = "anthropic" | "openai";
export const PROVIDER_IDS: ProviderId[] = ["anthropic", "openai"];
export const PROVIDER_LABEL: Record<ProviderId, string> = { anthropic: "Claude (Anthropic)", openai: "ChatGPT (OpenAI)" };
export const isProviderId = (v: unknown): v is ProviderId => v === "anthropic" || v === "openai";

export class AiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

// stop is why the model stopped: "length" means it ran out of room before it finished.
export type AiResult = { text: string; inputTokens: number | null; outputTokens: number | null; ms: number; stop: string | null };

const TIMEOUT_MS = 60_000;

// The services' own addresses. AI_ANTHROPIC_URL / AI_OPENAI_URL can point them at a proxy or gateway instead.
const BASE = {
  anthropic: (process.env.AI_ANTHROPIC_URL || "https://api.anthropic.com").replace(/\/$/, ""),
  openai: (process.env.AI_OPENAI_URL || "https://api.openai.com").replace(/\/$/, ""),
};

// A friendly sentence for the failures people actually hit, without echoing anything the provider sent back.
function explain(provider: ProviderId, status: number): string {
  const name = provider === "anthropic" ? "Anthropic" : "OpenAI";
  if (status === 401) return `${name} rejected this API key. Check that it is copied in full and still active.`;
  if (status === 403) return `${name} says this key isn't allowed to use that model or feature.`;
  if (status === 404) return `${name} doesn't know that model name. Pick one from the list or check the spelling.`;
  if (status === 429) return `${name} is rate-limiting this key or the account is out of credit. Check billing in the ${name} dashboard.`;
  if (status === 400) return `${name} refused the request. The model name may be wrong for this key.`;
  if (status >= 500) return `${name} is having a problem right now. Try again in a minute.`;
  return `${name} returned an error (${status}).`;
}

async function call(provider: ProviderId, url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new AiError(explain(provider, res.status), res.status);
    return await res.json();
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Error && e.name === "AbortError") throw new AiError("The AI service took too long to answer. Try again.");
    throw new AiError("Couldn't reach the AI service. Check the connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

const authHeaders = (provider: ProviderId, apiKey: string): Record<string, string> =>
  provider === "anthropic"
    ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }
    : { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };

type Message = {
  system?: string;
  prompt: string;
  maxTokens: number; // the length of the answer itself; thinking models get extra room on top
  temperature?: number;
  json?: boolean; // the answer must be a JSON object
};

// Models differ in what they accept: reasoning models refuse a temperature, older ones refuse a reasoning setting. When a
// service answers "bad request", the next, plainer set of options is tried, so a new or unusual model still works.
type Options = { temperature: number | undefined; reasoning: boolean; json: boolean };

// One request, one text answer.
export async function generate(provider: ProviderId, apiKey: string, model: string, m: Message): Promise<AiResult> {
  const started = Date.now();
  const same = (a: Options, b: Options) => a.temperature === b.temperature && a.reasoning === b.reasoning && a.json === b.json;

  if (provider === "anthropic") {
    const ladder: Options[] = [
      { temperature: m.temperature, reasoning: false, json: false },
      { temperature: undefined, reasoning: false, json: false },
    ].filter((o, i, all) => all.findIndex((x) => same(x, o)) === i);
    let last: unknown;
    for (const o of ladder) {
      const body: Record<string, unknown> = { model, max_tokens: m.maxTokens, messages: [{ role: "user", content: m.prompt }] };
      if (m.system) body.system = m.system;
      if (o.temperature !== undefined) body.temperature = o.temperature;
      try {
        const json = (await call(provider, `${BASE.anthropic}/v1/messages`, { method: "POST", headers: authHeaders(provider, apiKey), body: JSON.stringify(body) })) as {
          content?: { type: string; text?: string }[];
          usage?: { input_tokens?: number; output_tokens?: number };
          stop_reason?: string;
        };
        const text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
        return { text, inputTokens: json.usage?.input_tokens ?? null, outputTokens: json.usage?.output_tokens ?? null, ms: Date.now() - started, stop: json.stop_reason === "max_tokens" ? "length" : (json.stop_reason ?? null) };
      } catch (e) {
        last = e;
        if (!(e instanceof AiError && e.status === 400)) throw e;
      }
    }
    throw last;
  }

  // OpenAI. gpt-5 and the o-series think before they answer, and the thinking is paid for out of the same token limit. With a
  // small limit all of it goes on thinking and the answer comes back empty, so they get a much larger limit and the least
  // thinking the model allows.
  const thinks = /^(gpt-5|o\d)/.test(model);
  const effort = /^gpt-5/.test(model) ? "minimal" : "low";
  const ladder: Options[] = [
    { temperature: m.temperature, reasoning: thinks, json: Boolean(m.json) },
    { temperature: undefined, reasoning: thinks, json: Boolean(m.json) },
    { temperature: undefined, reasoning: false, json: false },
  ].filter((o, i, all) => all.findIndex((x) => same(x, o)) === i);
  const messages = [...(m.system ? [{ role: "system", content: m.system }] : []), { role: "user", content: m.prompt }];
  let last: unknown;
  for (const o of ladder) {
    const body: Record<string, unknown> = { model, messages, max_completion_tokens: thinks ? Math.max(m.maxTokens, 16000) : m.maxTokens };
    if (o.temperature !== undefined) body.temperature = o.temperature;
    if (o.reasoning) body.reasoning_effort = effort;
    if (o.json) body.response_format = { type: "json_object" };
    try {
      const json = (await call(provider, `${BASE.openai}/v1/chat/completions`, { method: "POST", headers: authHeaders(provider, apiKey), body: JSON.stringify(body) })) as {
        choices?: { message?: { content?: string | null }; finish_reason?: string }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: json.choices?.[0]?.message?.content ?? "",
        inputTokens: json.usage?.prompt_tokens ?? null,
        outputTokens: json.usage?.completion_tokens ?? null,
        ms: Date.now() - started,
        stop: json.choices?.[0]?.finish_reason ?? null,
      };
    } catch (e) {
      last = e;
      if (!(e instanceof AiError && e.status === 400)) throw e;
    }
  }
  throw last;
}

// The model names this account can use, so nobody has to guess a spelling.
export async function listModels(provider: ProviderId, apiKey: string): Promise<string[]> {
  if (provider === "anthropic") {
    const json = (await call(provider, `${BASE.anthropic}/v1/models?limit=100`, { headers: authHeaders(provider, apiKey) })) as { data?: { id: string }[] };
    return (json.data ?? []).map((m) => m.id);
  }
  const json = (await call(provider, `${BASE.openai}/v1/models`, { headers: authHeaders(provider, apiKey) })) as { data?: { id: string }[] };
  return (json.data ?? [])
    .map((m) => m.id)
    .filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|transcribe|tts|image|embedding|moderation|search|instruct|codex)/.test(id))
    .sort();
}

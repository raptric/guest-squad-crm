import { query } from "@/lib/db";
import { CHANNELS } from "@/lib/campaigns-format";
import { EMPTY_CRITERIA } from "@/lib/campaign-fit-format";
import { parseCriteria, type CampaignStep } from "@/lib/campaigns";
import { fetchPrompts } from "./content";
import { renderTemplate } from "./codes-format";
import { buildValuesForDraft, type DraftCampaign } from "./context";
import { AiError, generate, isProviderId, type ProviderId } from "./providers";
import { decryptKey } from "./crypto";
import { logAiUsage } from "./settings";

export class GenerateError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// The only placeholders a baseline may contain. They are filled in when the email is used for a company.
export const PLACEHOLDERS = ["first_name", "company_name", "city", "sender_name"];

const PROMPT_FOR_CHANNEL: Record<string, string> = { "Initial Email": "campaign_initial_email", "Follow-up Email": "campaign_followup_email" };
const TEMPERATURE = { low: 0.3, medium: 0.7, high: 1 } as const;

export type Version = { subject: string; body: string; words: number; warnings: string[] };
export type Generated = { versions: Version[]; remaining: number; tokens: number | null };

type Actor = { id: number | string; name: string; email: string; role: string; team_id: number | string | null; phone?: string | null; job_title?: string | null };

// ---- the form's content, as a campaign the prompts can read ----

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim().slice(0, max) : "");
const list = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 120)).filter(Boolean))].slice(0, max) : []);

// Lenient on purpose: the campaign is still being written, so missing pieces are fine. { campaign: {...same shape as a save}, step_index }
export function draftFromBody(raw: unknown): { campaign: DraftCampaign; stepNumber: number } | { error: string } {
  const b = (raw ?? {}) as { campaign?: Record<string, unknown>; step_index?: unknown };
  const c = b.campaign ?? {};
  const rawSteps = Array.isArray(c.steps) ? c.steps.slice(0, 40) : [];
  const selected = Number(b.step_index);
  if (!Number.isInteger(selected) || selected < 0 || selected >= rawSteps.length) return { error: "Choose a step." };

  const steps = rawSteps
    .map((x, i) => {
      const s = (x ?? {}) as Record<string, unknown>;
      const day = Number(s.day_number);
      const channel = typeof s.channel === "string" && (CHANNELS as readonly string[]).includes(s.channel) ? s.channel : "Other";
      const step: CampaignStep = {
        day_number: Number.isInteger(day) && day >= 1 && day <= 365 ? day : 1,
        channel,
        title: str(s.title, 200) || "(untitled step)",
        instructions: str(s.instructions, 4000),
        subject: str(s.subject, 200),
        body: str(s.body, 6000),
      };
      return { step, i };
    })
    // saved order is by day, ties by the order entered
    .sort((a, b2) => a.step.day_number - b2.step.day_number || a.i - b2.i);
  const stepNumber = steps.findIndex((x) => x.i === selected) + 1;

  const angle = str(c.outreach_angle, 120) || null;
  const secondary = list(c.secondary_pains, 8).filter((p) => p !== angle);
  const diffs = list(c.differentiators, 12);
  const criteria = parseCriteria(c.criteria);
  return {
    stepNumber,
    campaign: {
      code: str(c.code, 20) || "(not saved yet)",
      name: str(c.name, 120) || "(unnamed campaign)",
      criteria: "value" in criteria ? criteria.value : EMPTY_CRITERIA,
      steps: steps.map((x) => x.step),
      playbook: {
        outreach_angle: angle,
        pain_point: str(c.pain_point, 400),
        secondary_pains: secondary,
        secondary_other: secondary.includes("Other") ? str(c.secondary_other, 200) : "",
        positioning: str(c.positioning, 400),
        differentiators: diffs,
        differentiators_other: diffs.includes("Other") ? str(c.differentiators_other, 200) : "",
        call_to_action: str(c.call_to_action, 200),
      },
    },
  };
}

// ---- the reply ----

const TAIL = (versions: number, extra: string) =>
  [
    "",
    "HOW TO ANSWER",
    'Reply with JSON only, no other text, in exactly this shape: {"versions":[{"subject":"...","body":"..."}]}',
    `Write exactly ${versions} ${versions === 1 ? "version" : "versions"}.`,
    "Rules that always apply:",
    "- Use only the facts given above. Never invent numbers, names, customers or results. If something is not given, leave it out.",
    `- The only placeholders you may write are ${PLACEHOLDERS.map((p) => `{${p}}`).join(", ")}.`,
    '- "subject" is one line. "body" is plain text with line breaks, no markdown.',
    ...(extra ? [`- The person writing this campaign asked for: ${extra}`] : []),
  ].join("\n");

function parseVersions(text: string, max: number): { subject: string; body: string }[] {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const open = t.search(/[[{]/);
  if (open < 0) throw new GenerateError("The AI's reply could not be read. Try again.", 502);
  const close = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  let data: unknown;
  try {
    data = JSON.parse(t.slice(open, close + 1));
  } catch {
    throw new GenerateError("The AI's reply could not be read. Try again.", 502);
  }
  const arr = Array.isArray(data) ? data : (data as { versions?: unknown })?.versions;
  const out = (Array.isArray(arr) ? arr : [])
    .map((v) => ({ subject: str((v as Record<string, unknown>)?.subject, 200).replace(/\s+/g, " "), body: str((v as Record<string, unknown>)?.body, 6000) }))
    .filter((v) => v.body)
    .slice(0, max);
  if (!out.length) throw new GenerateError("The AI did not write anything usable. Try again.", 502);
  return out;
}

function check(v: { subject: string; body: string }, channel: string): Version {
  const warnings: string[] = [];
  const used = new Set([...`${v.subject}\n${v.body}`.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]));
  for (const name of used) if (!PLACEHOLDERS.includes(name)) warnings.push(`Uses {${name}}, which will not be filled in.`);
  if (channel === "Initial Email" && /https?:\/\/|www\./i.test(v.body)) warnings.push("Contains a link.");
  if (!v.subject) warnings.push("Has no subject line.");
  return { ...v, words: v.body.split(/\s+/).filter(Boolean).length, warnings };
}

// ---- generate ----

export async function generateBaseline(input: { actor: Actor; campaign: DraftCampaign; stepNumber: number; instruction: string }): Promise<Generated> {
  const { actor, campaign, stepNumber } = input;
  const step = campaign.steps[stepNumber - 1];
  const promptKey = step ? PROMPT_FOR_CHANNEL[step.channel] : undefined;
  if (!step || !promptKey) throw new GenerateError("AI writing is for Initial Email and Follow-up Email steps.", 400);

  // The database is a network hop away, so everything that does not depend on anything else is fetched at once.
  const [[settings], [{ used }], prompts, creds] = await Promise.all([
    query<{ active_provider: string | null; daily_limit: number; variants: number; creativity: "low" | "medium" | "high" }>("SELECT active_provider, daily_limit, variants, creativity FROM ai_settings WHERE id = 1"),
    query<{ used: number }>(
      "SELECT count(*)::int AS used FROM ai_usage WHERE user_id = $1 AND purpose <> 'test' AND ok AND (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date",
      [actor.id],
    ),
    fetchPrompts(),
    query<{ provider: string; api_key_enc: string | null; model: string }>("SELECT provider, api_key_enc, model FROM ai_providers"),
  ]);
  const provider = settings?.active_provider;
  if (!settings || !provider || !isProviderId(provider)) {
    throw new GenerateError(actor.role === "super_admin" ? "No AI service is in use yet. Choose one in Settings → AI." : "AI writing is not set up yet. Ask an admin to set it up.", 409);
  }
  if (used >= settings.daily_limit) throw new GenerateError(`You have used all ${settings.daily_limit} AI writes for today. The count restarts at midnight UTC.`, 429);

  const row = creds.find((c) => c.provider === provider);
  if (!row?.api_key_enc || !row.model) throw new GenerateError("The AI service is missing its key or model. An admin needs to check Settings → AI.", 409);
  let apiKey: string;
  try {
    apiKey = decryptKey(row.api_key_enc);
  } catch {
    throw new GenerateError("The saved API key can't be read. An admin needs to enter it again in Settings → AI.", 500);
  }
  const model = row.model;

  const template = prompts.find((p) => p.key === promptKey)!.body;
  const values = await buildValuesForDraft({ actor, campaign, stepNumber, variants: settings.variants });
  const extra = input.instruction.replace(/\s+/g, " ").trim().slice(0, 300);
  const prompt = `${renderTemplate(template, values).text}\n${TAIL(settings.variants, extra)}`;

  const call = (temperature?: number) => generate(provider as ProviderId, apiKey, model, { prompt, maxTokens: 3000, temperature });
  try {
    let result;
    try {
      result = await call(TEMPERATURE[settings.creativity] ?? 0.7);
    } catch (e) {
      // Some models do not accept a temperature setting. Try once without it.
      if (e instanceof AiError && e.status === 400) result = await call(undefined);
      else throw e;
    }
    const versions = parseVersions(result.text, settings.variants).map((v) => check(v, step.channel));
    await logAiUsage({ userId: actor.id, provider, model, purpose: "campaign_copy", inputTokens: result.inputTokens, outputTokens: result.outputTokens, ok: true });
    return { versions, remaining: Math.max(0, settings.daily_limit - used - 1), tokens: result.inputTokens !== null && result.outputTokens !== null ? result.inputTokens + result.outputTokens : null };
  } catch (e) {
    const message = e instanceof AiError || e instanceof GenerateError ? e.message : "The AI could not write this. Try again.";
    await logAiUsage({ userId: actor.id, provider, model, purpose: "campaign_copy", ok: false, error: message });
    if (e instanceof GenerateError) throw e;
    throw new GenerateError(message, 502);
  }
}

import { query } from "@/lib/db";
import { CHANNELS } from "@/lib/campaigns-format";
import { EMPTY_CRITERIA } from "@/lib/campaign-fit-format";
import { parseCriteria, type CampaignStep } from "@/lib/campaigns";
import { fetchPrompts } from "./content";
import { renderTemplate } from "./codes-format";
import { buildValuesForDraft, type DraftCampaign } from "./context";
import { AiError, generate, isProviderId, type AiResult, type ProviderId } from "./providers";
import { decryptKey } from "./crypto";
import { logAiUsage } from "./settings";

export class GenerateError extends Error {
  // detail is for the usage log (what actually came back); the message is what the person sees
  constructor(message: string, readonly status: number, readonly detail?: string) {
    super(message);
  }
}

// The only placeholders a baseline may contain. They are filled in when the email is used for a company.
export const PLACEHOLDERS = ["first_name", "company_name", "city", "sender_name"];

const PROMPT_FOR_CHANNEL: Record<string, string> = { "Initial Email": "campaign_initial_email", "Follow-up Email": "campaign_followup_email" };
export const TEMPERATURE = { low: 0.3, medium: 0.7, high: 1 } as const;

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

const answerFormat = (versions: number, shape: string) => [
  "",
  "HOW TO ANSWER",
  `Reply with JSON only, no other text, in exactly this shape: ${shape}`,
  `Write exactly ${versions} ${versions === 1 ? "version" : "versions"}.`,
];

export const TAIL = (versions: number, extra: string) =>
  [
    ...answerFormat(versions, '{"versions":[{"subject":"...","body":"..."}]}'),
    "Rules that always apply:",
    "- Use only the facts given above. Never invent numbers, names, customers or results. If something is not given, leave it out.",
    `- The only placeholders you may write are ${PLACEHOLDERS.map((p) => `{${p}}`).join(", ")}.`,
    '- "subject" is one line. "body" is text with line breaks. The only formatting allowed is **bold** for a few key words and, where a short list helps, lines that start with "- ". Use them sparingly and no other markdown.',
    "- The sender's signature (name and contact details) is added under the body automatically. End the body with a short closing line such as \"Best,\" and never write the sender's name or a signature yourself. This replaces any sign-off rule above.",
    ...(extra ? [`- The person writing this campaign asked for: ${extra}`] : []),
  ].join("\n");

// For an email to one company: it must name the facts it used, and say so if the company gave it nothing to work with.
export const COMPANY_TAIL = (versions: number, extra: string) =>
  [
    ...answerFormat(versions, '{"versions":[{"subject":"...","body":"...","facts_used":["..."],"notes":"..."}]}'),
    '- "facts_used": the specific facts from the company and contact details above that you used, each in a few words (for example "Booking.com rating 7.9"). An empty list if you used none.',
    '- "notes": one short sentence for the person if something needs their attention (for example that nothing relevant was found, so the baseline opening was kept). Otherwise an empty string.',
    "Rules that always apply:",
    "- Use only the facts given above. Never invent numbers, names, customers or results. If something is not given, leave it out.",
    "- The baseline may contain placeholders in curly braces, such as {company_name} or {first_name}. Replace each one with the real value. Never leave a curly-brace placeholder in the email.",
    '- "subject" is one line. "body" is text with line breaks. The only formatting allowed is **bold** and lines that start with "- ". Keep the baseline formatting; add none of your own if the baseline has none.',
    "- The sender's signature (name and contact details) is added under the body automatically. End the body with a short closing line such as \"Best,\" and never write the sender's name or a signature yourself. This replaces any sign-off rule above.",
    ...(extra ? [`- The person sending this email asked for: ${extra}`] : []),
  ].join("\n");

export type Parsed = { subject: string; body: string; facts_used: string[]; notes: string };

export function parseVersions(result: AiResult, max: number): Parsed[] {
  const t = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const peek = t.replace(/\s+/g, " ").slice(0, 160);
  if (!t) {
    if (result.stop === "length") {
      throw new GenerateError(
        "The AI ran out of room before it finished writing. Try again, or ask an admin to choose a different model in Settings → AI.",
        502,
        `empty reply, the model hit its length limit (${result.outputTokens ?? "?"} tokens used)`,
      );
    }
    throw new GenerateError("The AI sent back nothing. Try again.", 502, `empty reply (stop: ${result.stop ?? "unknown"})`);
  }
  const unreadable = () => new GenerateError("The AI's reply could not be read. Try again.", 502, `unreadable reply (stop: ${result.stop ?? "unknown"}): ${peek}`);
  const open = t.search(/[[{]/);
  if (open < 0) throw unreadable();
  const close = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  let data: unknown;
  try {
    data = JSON.parse(t.slice(open, close + 1));
  } catch {
    throw unreadable();
  }
  const arr = Array.isArray(data) ? data : (data as { versions?: unknown })?.versions;
  const out = (Array.isArray(arr) ? arr : [])
    .map((v) => {
      const o = (v ?? {}) as Record<string, unknown>;
      return {
        subject: str(o.subject, 200).replace(/\s+/g, " "),
        body: str(o.body, 6000),
        facts_used: Array.isArray(o.facts_used) ? o.facts_used.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 160)).filter(Boolean).slice(0, 12) : [],
        notes: str(o.notes, 300).replace(/\s+/g, " "),
      };
    })
    .filter((v) => v.body)
    .slice(0, max);
  if (!out.length) throw new GenerateError("The AI did not write anything usable. Try again.", 502);
  return out;
}

// What is wrong with a draft that the AI itself will not mention. allowed is the list of placeholders that may stay in it.
export function check(v: { subject: string; body: string }, channel: string, allowed: string[] = PLACEHOLDERS): Version {
  const warnings: string[] = [];
  const used = new Set([...`${v.subject}\n${v.body}`.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]));
  for (const name of used) {
    warnings.push(allowed.includes(name) ? "" : allowed.length ? `Uses {${name}}, which will not be filled in.` : `Still has {${name}} to fill in.`);
  }
  if (channel === "Initial Email" && /https?:\/\/|www\./i.test(v.body)) warnings.push("Contains a link.");
  if (!v.subject) warnings.push("Has no subject line.");
  return { ...v, words: v.body.split(/\s+/).filter(Boolean).length, warnings: warnings.filter(Boolean) };
}

// ---- everything the AI needs before a call: the service in use, the person's limit, the prompt text ----

export type Runtime = {
  provider: ProviderId;
  apiKey: string;
  model: string;
  variants: number;
  creativity: "low" | "medium" | "high";
  dailyLimit: number;
  used: number;
  template: string;
};

export async function prepare(actor: Actor, promptKey: string): Promise<Runtime> {
  // The database is a network hop away, so everything that does not depend on anything else is fetched at once.
  const [[settings], [{ used }], prompts, creds] = await Promise.all([
    query<{ active_provider: string | null; daily_limit: number; variants: number; creativity: "low" | "medium" | "high"; writing_enabled: boolean }>("SELECT active_provider, daily_limit, variants, creativity, writing_enabled FROM ai_settings WHERE id = 1"),
    query<{ used: number }>(
      "SELECT count(*)::int AS used FROM ai_usage WHERE user_id = $1 AND purpose <> 'test' AND ok AND (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date",
      [actor.id],
    ),
    fetchPrompts(),
    query<{ provider: string; api_key_enc: string | null; model: string }>("SELECT provider, api_key_enc, model FROM ai_providers"),
  ]);
  if (!settings?.writing_enabled) throw new GenerateError(actor.role === "super_admin" ? "AI writing is switched off. Turn it on in Settings → AI." : "AI writing is switched off.", 403);
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
  return { provider, apiKey, model: row.model, variants: settings.variants, creativity: settings.creativity, dailyLimit: settings.daily_limit, used, template: prompts.find((p) => p.key === promptKey)!.body };
}

// One call to the AI service, logged whether it worked or not. what() turns the reply into the result.
export async function runAi<T>(actor: Actor, rt: Runtime, purpose: string, prompt: string, what: (r: AiResult) => T): Promise<{ value: T; tokens: number | null }> {
  try {
    const result = await generate(rt.provider, rt.apiKey, rt.model, { prompt, maxTokens: 3000, temperature: TEMPERATURE[rt.creativity] ?? 0.7, json: true });
    const value = what(result);
    await logAiUsage({ userId: actor.id, provider: rt.provider, model: rt.model, purpose, inputTokens: result.inputTokens, outputTokens: result.outputTokens, ok: true });
    return { value, tokens: result.inputTokens !== null && result.outputTokens !== null ? result.inputTokens + result.outputTokens : null };
  } catch (e) {
    const message = e instanceof AiError || e instanceof GenerateError ? e.message : "The AI could not write this. Try again.";
    await logAiUsage({ userId: actor.id, provider: rt.provider, model: rt.model, purpose, ok: false, error: e instanceof GenerateError && e.detail ? e.detail : message });
    if (e instanceof GenerateError) throw e;
    throw new GenerateError(message, 502);
  }
}

// ---- generate a baseline for a campaign step ----

export async function generateBaseline(input: { actor: Actor; campaign: DraftCampaign; stepNumber: number; instruction: string }): Promise<Generated> {
  const { actor, campaign, stepNumber } = input;
  const step = campaign.steps[stepNumber - 1];
  const promptKey = step ? PROMPT_FOR_CHANNEL[step.channel] : undefined;
  if (!step || !promptKey) throw new GenerateError("AI writing is for Initial Email and Follow-up Email steps.", 400);

  const rt = await prepare(actor, promptKey);
  const values = await buildValuesForDraft({ actor, campaign, stepNumber, variants: rt.variants });
  const extra = input.instruction.replace(/\s+/g, " ").trim().slice(0, 300);
  const prompt = `${renderTemplate(rt.template, values).text}\n${TAIL(rt.variants, extra)}`;

  const { value, tokens } = await runAi(actor, rt, "campaign_copy", prompt, (r) => parseVersions(r, rt.variants).map((v) => check(v, step.channel)));
  return { versions: value, remaining: Math.max(0, rt.dailyLimit - rt.used - 1), tokens };
}

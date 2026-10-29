// The step types the AI writes for, and the writing rules text. Safe to import from the browser.

// The step types match the Channel dropdown in a campaign step (Initial Email, Follow-up Email, Call, LinkedIn ...).
export const ROLES = [
  { key: "initial_email", label: "Initial Email", channel: "email" },
  { key: "followup_email", label: "Follow-up Email", channel: "email" },
  { key: "call", label: "Call", channel: "call" },
  { key: "linkedin_connect", label: "LinkedIn connection", channel: "linkedin" },
  { key: "linkedin_message", label: "LinkedIn message", channel: "linkedin" },
] as const;

export type RoleKey = (typeof ROLES)[number]["key"];
export const ROLE_KEYS = ROLES.map((r) => r.key) as RoleKey[];

// Earlier versions used other names; saved history and examples may still carry them.
const LEGACY_ROLE: Record<string, RoleKey> = { opener: "initial_email", followup: "followup_email", value_add: "followup_email", breakup: "followup_email", call_script: "call" };
export function normalizeRole(key: string): RoleKey | null {
  if ((ROLE_KEYS as string[]).includes(key)) return key as RoleKey;
  return LEGACY_ROLE[key] ?? null;
}
export const roleLabel = (key: string) => ROLES.find((r) => r.key === normalizeRole(key))?.label ?? key;

export const RULES_TEXT_MAX = 6000;

export const DEFAULT_RULES_TEXT = `VOICE
Direct, calm, practical, hospitality-aware. We sound like someone who has worked a front desk. Not salesy, pushy, corporate, hyped or flattering. Peer to peer. Short sentences, one idea each, plain words (grade 6 to 8). No exclamation marks.

STRUCTURE
- Open with something real about them or the campaign's pain. Never open with who we are. If there is nothing real, do not pretend to know them.
- One pain and one idea per email. Use proof only if it is in the knowledge. Never invent numbers, names or reviews.
- Exactly one ask, as a low-pressure question.
- Plain text. No links or attachments in the first email.
- Sign off with the sender's own name only.

NEVER WRITE
"I hope this finds you well", "touching base", "circling back", "just following up", "synergy", "game-changer", "revolutionary", "best-in-class", "cutting-edge", "leverage", "I wanted to reach out", "as per my last email".
Avoid spam-trigger words: free, guarantee, act now, limited time, risk-free, 100%, winner, urgent, click here.`;

type LegacyRules = {
  roles?: Record<string, { min?: number; max?: number; notes?: string }>;
  email?: Record<string, unknown>;
  voice?: string;
  bannedPhrases?: string[];
  spamWords?: string[];
  extra?: string;
};

// The first version of the rules was a set of fields. Turn one into the plain text that replaced it.
export function legacyRulesToText(d: LegacyRules): string {
  const out: string[] = [];
  if (d.voice?.trim()) out.push(`VOICE\n${d.voice.trim()}`);
  const structure = [d.extra?.trim()].filter(Boolean) as string[];
  const e = d.email ?? {};
  if (e.noLinksInFirst) structure.push("No links in the first email.");
  if (e.plainTextOnly) structure.push("Plain text only.");
  if (e.oneAsk) structure.push("Exactly one ask.");
  if (e.personalHook) structure.push("Open with something real about them.");
  if (e.lowercaseSubject) structure.push("Subject line in lowercase.");
  if (structure.length) out.push(`STRUCTURE\n${structure.join("\n")}`);
  const never = [...(d.bannedPhrases ?? []), ...(d.spamWords ?? [])];
  if (never.length) out.push(`NEVER WRITE\n${never.map((n) => `"${n}"`).join(", ")}`);
  return out.join("\n\n") || DEFAULT_RULES_TEXT;
}

// Saved rules are { text } now. Older saves hold the field version, which is converted when read.
export function rulesText(data: unknown): string {
  const d = (data ?? {}) as { text?: unknown } & LegacyRules;
  return typeof d.text === "string" ? d.text : legacyRulesToText(d);
}

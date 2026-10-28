// The writing rules and what they contain. Safe to import from the browser; the server-side checks are in rules.ts.

export const ROLES = [
  { key: "opener", label: "Opener (first email)", channel: "email", unit: "words" },
  { key: "followup", label: "Follow-up email", channel: "email", unit: "words" },
  { key: "value_add", label: "Value-add email", channel: "email", unit: "words" },
  { key: "breakup", label: "Breakup email", channel: "email", unit: "words" },
  { key: "linkedin_connect", label: "LinkedIn connection note", channel: "linkedin", unit: "characters" },
  { key: "linkedin_message", label: "LinkedIn message", channel: "linkedin", unit: "characters" },
  { key: "call_script", label: "Call script", channel: "call", unit: "words" },
] as const;

export type RoleKey = (typeof ROLES)[number]["key"];
export const ROLE_KEYS = ROLES.map((r) => r.key) as RoleKey[];
export const roleLabel = (key: string) => ROLES.find((r) => r.key === key)?.label ?? key;

// The pain types the CRM records on a property (Pain Signals), so each can carry an angle to write about.
export const PAIN_TYPES = ["Calls", "Reservations", "After-hours", "Check-in / Access", "OTA Messaging", "WhatsApp", "Guest Requests", "Front Desk Staffing", "Reviews"] as const;

export type RoleRule = { min: number; max: number; notes: string };
export type Creativity = "low" | "medium" | "high";

export type Rules = {
  roles: Record<RoleKey, RoleRule>;
  email: {
    subjectMinWords: number;
    subjectMaxWords: number;
    lowercaseSubject: boolean;
    noLinksInFirst: boolean;
    plainTextOnly: boolean;
    oneAsk: boolean;
    personalHook: boolean;
  };
  voice: string;
  bannedPhrases: string[];
  spamWords: string[];
  painAngles: Record<string, string>;
  extra: string;
  defaults: { variants: 1 | 2 | 3; creativity: Creativity };
};

export const DEFAULT_RULES: Rules = {
  roles: {
    opener: { min: 60, max: 110, notes: "Hook about them, one pain, one proof (only if approved), one ask. This is the only email that introduces GuestSquad." },
    followup: { min: 40, max: 80, notes: "A new angle each time, shorter than the opener. Never says it is following up." },
    value_add: { min: 40, max: 90, notes: "One useful insight or approved proof point, plus a soft ask." },
    breakup: { min: 20, max: 50, notes: "Two or three lines. No pressure. Says this is the last note and leaves the door open." },
    linkedin_connect: { min: 0, max: 300, notes: "No pitch. A reason to connect." },
    linkedin_message: { min: 0, max: 400, notes: "One question." },
    call_script: { min: 60, max: 220, notes: "Opener line, reason for the call, one question, a 20-second voicemail, and a gatekeeper line." },
  },
  email: { subjectMinWords: 2, subjectMaxWords: 5, lowercaseSubject: true, noLinksInFirst: true, plainTextOnly: true, oneAsk: true, personalHook: true },
  voice:
    "We are: direct, calm, practical, hospitality-aware. We sound like someone who has worked a front desk.\n" +
    "We are not: salesy, pushy, corporate, hyped, or flattering.\n" +
    "Peer to peer. Short sentences, one idea each, reading level around grade 6 to 8. No exclamation marks.",
  bannedPhrases: [
    "I hope this finds you well",
    "touching base",
    "circling back",
    "just following up",
    "synergy",
    "game-changer",
    "revolutionary",
    "best-in-class",
    "cutting-edge",
    "leverage",
    "I wanted to reach out",
    "as per my last email",
  ],
  spamWords: ["free", "guarantee", "act now", "limited time", "risk-free", "no obligation", "100%", "winner", "urgent", "click here"],
  painAngles: {
    Calls: "Calls go unanswered when the desk is busy.",
    Reservations: "Booking enquiries wait too long for a reply.",
    "After-hours": "Nobody covers guest messages and calls overnight.",
    "Check-in / Access": "Late arrivals can't get in or get help.",
    "OTA Messaging": "Messages on Booking.com or Expedia sit unanswered.",
    WhatsApp: "Guests message on WhatsApp and nobody watches it.",
    "Guest Requests": "Requests slip through during busy periods.",
    "Front Desk Staffing": "Front desk staff are hard to hire and keep.",
    Reviews: "Reviews mention slow replies.",
  },
  extra:
    "Use only facts that are given. Never invent numbers, reviews, names or events. If a fact is missing, leave it out.\n" +
    "Use one real fact about the recipient or the property in the opening. If there is none, use the campaign hook and do not pretend to know them.\n" +
    "Use the placeholders {first_name}, {property_name} and {city}. Do not guess a missing value.\n" +
    "Sign off with the sender's own name only.",
  defaults: { variants: 2, creativity: "medium" },
};

// Fill anything missing from older saved data with the starting values.
export function withDefaults(saved: Partial<Rules> | null | undefined): Rules {
  const s = saved ?? {};
  return {
    roles: Object.fromEntries(ROLE_KEYS.map((k) => [k, { ...DEFAULT_RULES.roles[k], ...(s.roles?.[k] ?? {}) }])) as Record<RoleKey, RoleRule>,
    email: { ...DEFAULT_RULES.email, ...(s.email ?? {}) },
    voice: s.voice ?? DEFAULT_RULES.voice,
    bannedPhrases: s.bannedPhrases ?? DEFAULT_RULES.bannedPhrases,
    spamWords: s.spamWords ?? DEFAULT_RULES.spamWords,
    painAngles: { ...DEFAULT_RULES.painAngles, ...(s.painAngles ?? {}) },
    extra: s.extra ?? DEFAULT_RULES.extra,
    defaults: { ...DEFAULT_RULES.defaults, ...(s.defaults ?? {}) },
  };
}

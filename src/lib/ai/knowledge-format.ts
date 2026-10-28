// The knowledge topics the AI is told about. Safe to import from the browser.

export type Topic = { key: string; title: string; hint: string; rows: number };

export const KNOWLEDGE_TOPICS: Topic[] = [
  { key: "about", title: "About GuestSquad", hint: "What it is and how it works, in 100 to 150 words, in plain language.", rows: 6 },
  { key: "who", title: "Who we serve", hint: "The property types and sizes that fit, and who does not.", rows: 4 },
  { key: "proof", title: "Proof points", hint: "Only approved numbers, results and customer names. If this stays empty the AI uses no proof at all.", rows: 5 },
  { key: "differentiators", title: "Differentiators", hint: "Why GuestSquad rather than in-house staff, a call center, or a competitor.", rows: 5 },
  { key: "objections", title: "Objection answers", hint: "Short approved replies to doubts such as “we already have staff”. One per line, with the doubt first.", rows: 6 },
  {
    key: "never_claim",
    title: "Never claim",
    hint: "Things the AI must never say or promise.",
    rows: 6,
  },
];

export const serviceKey = (name: string) => `service:${name}`;
export const KNOWLEDGE_BODY_MAX = 4000;

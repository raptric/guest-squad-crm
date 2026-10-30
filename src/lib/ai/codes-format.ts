// Short codes: the {{words}} a prompt can use. The CRM replaces each with real text before the prompt is sent.
// This file is safe to import from the browser: the list of codes, the check for typos, and the filling-in itself.
//
//   {{block}}   inserts a labelled section (for example the whole campaign, or everything about a company)
//   {{field}}   inserts one raw value
//   A line that is only a label and a code, whose code has nothing to insert, disappears (and so does a heading in capitals
//   directly above it). In a longer line an empty code becomes "(not available)".

export type CodeScope = "campaign" | "company"; // "company" codes only have a value in the Company prompts

export type CodeDef = { code: string; block?: boolean; group: string; label: string; scope: CodeScope; soon?: boolean; optIn?: boolean };

export const CODE_GROUPS = ["Knowledge", "Writing rules", "Campaign", "Step", "Sequence", "Generation", "Company", "Property", "Signals and offer", "Contact", "Sender", "Baseline and history"] as const;

const c = (group: (typeof CODE_GROUPS)[number], code: string, label: string, o: Partial<CodeDef> = {}): CodeDef => ({ code, group, label, scope: "campaign", ...o });
const co = (group: (typeof CODE_GROUPS)[number], code: string, label: string, o: Partial<CodeDef> = {}): CodeDef => ({ code, group, label, scope: "company", ...o });

export const CODES: CodeDef[] = [
  c("Knowledge", "knowledge", "Everything in Knowledge, with headings", { block: true }),
  c("Knowledge", "knowledge.about", "About GuestSquad"),
  c("Knowledge", "knowledge.who", "Who we serve"),
  c("Knowledge", "knowledge.services", "Every service description, one per service"),
  c("Knowledge", "knowledge.proof", "Proof points"),
  c("Knowledge", "knowledge.differentiators", "Differentiators"),
  c("Knowledge", "knowledge.objections", "Objection answers"),
  c("Knowledge", "knowledge.never_claim", "Never claim"),

  c("Writing rules", "rules", "The writing rules text"),

  c("Campaign", "campaign", "The campaign details, with headings", { block: true }),
  c("Campaign", "campaign.name", "Campaign name"),
  c("Campaign", "campaign.code", "Campaign code, such as C-007"),
  c("Campaign", "campaign.angle", "Outreach angle"),
  c("Campaign", "campaign.pain", "Main pain"),
  c("Campaign", "campaign.other_pains", "Other pain points"),
  c("Campaign", "campaign.positioning", "Positioning"),
  c("Campaign", "campaign.differentiators", "Key differentiators"),
  c("Campaign", "campaign.call_to_action", "Call to action"),
  c("Campaign", "campaign.audience", "Who the campaign targets"),

  c("Step", "step", "This step: type, place in the sequence, day, title, instructions", { block: true }),
  c("Step", "step.type", "Step type, such as Initial Email"),
  c("Step", "step.number", "Step number"),
  c("Step", "step.total", "Number of steps in the campaign"),
  c("Step", "step.day", "Day of the sequence"),
  c("Step", "step.title", "Step title"),
  c("Step", "step.instructions", "Step instructions"),

  c("Sequence", "sequence", "Outline plus the earlier steps, with headings", { block: true }),
  c("Sequence", "sequence.outline", "One line per step of the campaign"),
  c("Sequence", "sequence.previous", "The earlier steps in full (their saved baseline once it exists)"),

  c("Generation", "generation.versions", "How many versions to write (set in AI settings)"),

  co("Company", "company", "Everything the CRM holds about the company, with headings", { block: true }),
  co("Company", "company.name", "Company name"),
  co("Company", "company.type", "Company type"),
  co("Company", "company.website", "Website"),
  co("Company", "company.city", "City"),
  co("Company", "company.location", "City, state, country"),
  co("Company", "company.address", "Full address"),
  co("Company", "company.phone", "Phone"),
  co("Company", "company.email", "General email"),
  co("Company", "company.brand", "Brand"),
  co("Company", "company.ownership", "Ownership entity"),
  co("Company", "company.operator", "Operating entity"),
  co("Company", "company.manager", "Management entity"),
  co("Company", "company.parent", "Parent company"),
  co("Company", "company.primary_parent", "Primary operating parent and the reason", { optIn: true }),
  co("Company", "company.portfolio_size", "Portfolio size"),
  co("Company", "company.why_now", "The \"why now\" summary written by research"),
  co("Company", "company.researched", "When it was last researched"),
  co("Company", "company.contacts", "The people on file at the company", { optIn: true }),
  co("Company", "company.stage", "Pipeline status and stage (internal)", { optIn: true }),
  co("Company", "company.tier", "Prospect tier (internal)", { optIn: true }),
  co("Company", "company.summary", "Qualification summary (internal research notes)", { optIn: true }),
  co("Company", "company.fit", "How well it fits this campaign, and why (internal)", { optIn: true }),
  co("Company", "company.activity", "Recent notes, calls and emails (internal)", { optIn: true }),

  co("Property", "property", "All the property details", { block: true }),
  co("Property", "property.type", "Property type"),
  co("Property", "property.class", "Star class"),
  co("Property", "property.rooms", "Rooms or units"),
  co("Property", "property.portfolio_role", "Portfolio role"),
  co("Property", "property.contactless", "Contactless (yes or empty)"),

  co("Signals and offer", "company.ratings", "Ratings on Google, Booking.com, Expedia and others"),
  co("Signals and offer", "company.pain_signals", "Pain signals found for the property"),
  co("Signals and offer", "company.hiring", "Hiring signals"),
  co("Signals and offer", "company.signals", "Other signals"),
  co("Signals and offer", "company.offer", "Recommended offer and the reason"),

  co("Contact", "contact", "The person being written to, with headings", { block: true }),
  co("Contact", "contact.name", "Full name"),
  co("Contact", "contact.first_name", "First name"),
  co("Contact", "contact.last_name", "Last name"),
  co("Contact", "contact.title", "Job title"),
  co("Contact", "contact.role", "Contact role"),
  co("Contact", "contact.level", "Decision maker level"),
  co("Contact", "contact.line_type", "Front desk or owner-run line"),
  co("Contact", "contact.email", "Email"),
  co("Contact", "contact.phone", "Phone"),
  co("Contact", "contact.linkedin", "LinkedIn"),

  co("Sender", "sender", "The person sending, with headings", { block: true }),
  co("Sender", "sender.name", "Sender name"),
  co("Sender", "sender.title", "Sender job title"),
  co("Sender", "sender.phone", "Sender phone"),
  co("Sender", "sender.email", "Sender email"),
  co("Sender", "sender.signature", "Sender signature, added under the email when it is sent"),

  co("Baseline and history", "baseline", "The saved baseline for this step, with headings", { block: true }),
  co("Baseline and history", "baseline.subject", "Baseline subject"),
  co("Baseline and history", "baseline.body", "Baseline text"),
  co("Baseline and history", "sent_so_far", "What was already sent to this company in this campaign"),
];

const BY_CODE = new Map(CODES.map((d) => [d.code, d]));
export const codeDef = (code: string) => BY_CODE.get(code);
export const asTag = (code: string) => `{{${code}}}`;

const CODE_RE = /\{\{\s*([^{}\n]*?)\s*\}\}/g;

export function findCodes(text: string): string[] {
  return [...text.matchAll(CODE_RE)].map((m) => m[1]);
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export type CodeProblem = { code: string; kind: "unknown" | "company_only"; suggestion?: string };

// What is wrong with the codes in a prompt: ones that don't exist (with the closest real one), and company codes used in a
// Campaign prompt, where there is no company to fill them from.
export function checkCodes(text: string, promptScope: CodeScope): CodeProblem[] {
  const out: CodeProblem[] = [];
  for (const code of new Set(findCodes(text))) {
    const def = BY_CODE.get(code);
    if (!def) {
      const best = CODES.map((d) => ({ d, n: distance(code.toLowerCase(), d.code) })).sort((x, y) => x.n - y.n)[0];
      out.push({ code, kind: "unknown", suggestion: best && best.n <= 3 ? best.d.code : undefined });
    } else if (def.scope === "company" && promptScope === "campaign") out.push({ code, kind: "company_only" });
  }
  return out;
}

const HEADING = /^[A-Z][A-Z0-9 ,'&/().:-]{2,}$/;
const LABEL_MAX = 40;

export type Rendered = { text: string; empty: string[]; unknown: string[] };

// Fill in a prompt. values maps a code to its text; a code missing from values, or empty, counts as empty.
export function renderTemplate(template: string, values: Record<string, string>): Rendered {
  const empty = new Set<string>();
  const unknown = new Set<string>();
  const out: string[] = [];

  for (const line of template.replace(/\r\n/g, "\n").split("\n")) {
    const codes = [...line.matchAll(CODE_RE)].map((m) => m[1]);
    if (!codes.length) {
      out.push(line);
      continue;
    }
    const known = codes.filter((code) => BY_CODE.has(code));
    for (const code of codes) if (!BY_CODE.has(code)) unknown.add(code);
    const emptyHere = known.filter((code) => !(values[code] ?? "").trim());
    for (const code of emptyHere) empty.add(code);

    // a label with nothing to show disappears, and the capital-letters heading right above it
    const onlyEmpty = known.length === codes.length && emptyHere.length === codes.length;
    if (onlyEmpty && line.replace(CODE_RE, "").trim().length <= LABEL_MAX) {
      const prev = out.length ? out[out.length - 1] : null;
      if (prev !== null && HEADING.test(prev.trim())) out.pop();
      continue;
    }

    out.push(
      line.replace(CODE_RE, (whole, code: string) => {
        if (!BY_CODE.has(code)) return whole;
        const v = (values[code] ?? "").trim();
        return v || "(not available)";
      }),
    );
  }

  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), empty: [...empty], unknown: [...unknown] };
}

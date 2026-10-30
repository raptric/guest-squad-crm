import { query, withTransaction } from "@/lib/db";
import { fetchCampaign, type CampaignStep, type Playbook } from "@/lib/campaigns";
import { fetchFitForCompany } from "@/lib/campaign-fit";
import { audienceSummary, type Criteria } from "@/lib/campaign-fit-format";
import type { Actor } from "@/lib/assignment";
import { fetchKnowledge, fetchRules } from "./content";
import { fetchSignature } from "@/lib/mail/signature";
import { effectiveSignature } from "@/lib/signature-format";

// Turns the real data (knowledge, rules, a campaign step, a company, a contact, the sender) into the text for every short code.
// Server only. Used by the Prompts preview now, and by the Generate buttons later.

export type ContactChoice = { kind: "contact"; id: number } | { kind: "company" } | null;
export type ContextInput = {
  actor: Actor & { id: string | number; name: string; email: string; phone?: string | null; job_title?: string | null };
  campaignId: string;
  stepNumber: number; // 1-based place in the campaign
  companyId?: number | null;
  contact?: ContactChoice;
  // Reading the campaign for someone who is working one of its tasks but could not otherwise open it.
  campaignActor?: Actor;
  // The kind of step the task was made for. If the campaign's step at that place is a different kind now, its baseline is not used.
  expectChannel?: string;
};
export type ContextResult = { values: Record<string, string>; notes: string[] };

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function date(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const join = (parts: unknown[], sep = ", ") => parts.map(s).filter(Boolean).join(sep);
const lines = (rows: string[]) => rows.filter(Boolean).join("\n");
// "Label: value" lines, skipping the empty ones.
const facts = (pairs: [string, unknown][]) => lines(pairs.filter(([, v]) => s(v)).map(([k, v]) => `${k}: ${s(v)}`));
const section = (title: string, body: string) => (body.trim() ? `${title}\n${body.trim()}` : "");

const RATING_CHANNEL: Record<string, string> = { google: "Google", booking_com: "Booking.com", expedia: "Expedia", hotels_com: "Hotels.com", tripadvisor: "TripAdvisor", vrbo: "Vrbo", airbnb: "Airbnb", other: "Other" };

// ---- knowledge, rules, generation ----

async function knowledgeValues(): Promise<Record<string, string>> {
  const { topics, services } = await fetchKnowledge();
  const by = (key: string) => topics.find((t) => t.key === key)?.body.trim() ?? "";
  const serviceText = services.filter((x) => x.body.trim()).map((x) => `- ${x.title}: ${x.body.trim()}`).join("\n");
  return {
    "knowledge.about": by("about"),
    "knowledge.who": by("who"),
    "knowledge.services": serviceText,
    "knowledge.proof": by("proof"),
    "knowledge.differentiators": by("differentiators"),
    "knowledge.objections": by("objections"),
    "knowledge.never_claim": by("never_claim"),
    knowledge: lines([
      section("ABOUT GUESTSQUAD", by("about")),
      section("WHO WE SERVE", by("who")),
      section("SERVICES", serviceText),
      section("PROOF POINTS", by("proof")),
      section("DIFFERENTIATORS", by("differentiators")),
      section("OBJECTION ANSWERS", by("objections")),
      section("NEVER CLAIM", by("never_claim")),
    ].map((x) => (x ? `${x}\n` : ""))).trim(),
  };
}

// ---- campaign and step ----

// A campaign as the prompts see it. A saved campaign fits this, and so does the form's current content before it is saved.
export type DraftCampaign = { code: string; name: string; playbook: Playbook; criteria: Criteria; steps: CampaignStep[] };

function campaignValues(k: DraftCampaign, stepNumber: number): Record<string, string> {
  const p = k.playbook;
  const others = join([...p.secondary_pains, p.secondary_other], "; ");
  const diffs = join([...p.differentiators, p.differentiators_other], "; ");
  const step = k.steps[stepNumber - 1];
  const stepText = step
    ? facts([
        ["Step type", step.channel],
        ["Place in the sequence", `step ${stepNumber} of ${k.steps.length}, day ${step.day_number}`],
        ["Title", step.title],
        ["Instructions", step.instructions],
      ])
    : "";

  const outline = k.steps.map((x, i) => `${i + 1}. Day ${x.day_number} · ${x.channel} — ${x.title}${i + 1 === stepNumber ? "   <- this step" : ""}`).join("\n");
  const previous = k.steps
    .slice(0, stepNumber - 1)
    .map((x, i) => {
      const saved = x.body?.trim() ? `\nSaved baseline email:\n${x.subject?.trim() ? `Subject: ${x.subject.trim()}\n` : ""}${x.body.trim()}` : "";
      return `Step ${i + 1} · ${x.channel} · day ${x.day_number} — ${x.title}${x.instructions.trim() ? `\n${x.instructions.trim()}` : ""}${saved}`;
    })
    .join("\n\n");

  const audience = audienceSummary(k.criteria);
  return {
    "campaign.name": k.name,
    "campaign.code": k.code,
    "campaign.angle": s(p.outreach_angle),
    "campaign.pain": s(p.pain_point),
    "campaign.other_pains": others,
    "campaign.positioning": s(p.positioning),
    "campaign.differentiators": diffs,
    "campaign.call_to_action": s(p.call_to_action),
    "campaign.audience": audience,
    campaign: lines([
      `CAMPAIGN ${k.code}: ${k.name}`,
      facts([
        ["Outreach angle", p.outreach_angle],
        ["Main pain", p.pain_point],
        ["Other pain points", others],
        ["Positioning", p.positioning],
        ["Key differentiators", diffs],
        ["Call to action", p.call_to_action],
        ["Who it targets", audience],
      ]),
    ]),
    "step.type": step?.channel ?? "",
    "step.number": step ? String(stepNumber) : "",
    "step.total": String(k.steps.length),
    "step.day": step ? String(step.day_number) : "",
    "step.title": step?.title ?? "",
    "step.instructions": step?.instructions ?? "",
    step: section("THIS STEP", stepText),
    "sequence.outline": outline,
    "sequence.previous": previous,
    sequence: lines([section("SEQUENCE", outline), previous ? `\n${section("EARLIER STEPS", previous)}` : ""]),
  };
}

// ---- company ----

async function companyValues(companyId: number, campaignId: string, notes: string[]): Promise<Record<string, string>> {
  const data = await withTransaction(async (cl) => {
    const q = async (text: string, params: unknown[]) => (await cl.query(text, params)).rows as Row[];
    const [company] = await q(
      `SELECT c.name, c.website, c.company_type, c.address_line_1, c.address_line_2, c.city, c.state, c.country, c.zip, c.phone, c.email, c.brand_name,
              c.ownership_entity, c.operating_entity, c.management_entity, c.primary_operating_parent, c.primary_parent_reason, c.portfolio_size,
              c.prospect_tier, c.qualification_summary, c.sdr_signal_summary, c.last_researched,
              pd.id AS property_id, pd.property_type, pd.property_class, pd.rooms_units, pd.portfolio_role, pd.contactless,
              ps.name AS status_name, pg.name AS stage_name, p.name AS parent_name
         FROM companies c
         LEFT JOIN property_details pd ON pd.company_id = c.id
         LEFT JOIN pipeline_statuses ps ON ps.id = c.pipeline_status_id
         LEFT JOIN pipeline_stages pg ON pg.id = c.pipeline_stage_id
         LEFT JOIN companies p ON p.id = c.parent_company_id
        WHERE c.id = $1 AND c.deleted_at IS NULL`,
      [companyId],
    );
    if (!company) return null;
    const [ratings, pains, hiring, signals, offers, contacts, activity] = [
      await q("SELECT channel, rating, review_count, captured_at FROM company_ratings WHERE company_id = $1 ORDER BY channel", [companyId]),
      company.property_id ? await q("SELECT pain_type, detected_at FROM property_pain_signals WHERE property_id = $1 ORDER BY detected_at DESC, id DESC LIMIT 10", [company.property_id]) : [],
      await q("SELECT role, job_title, strength, detected_at FROM company_hiring_signals WHERE company_id = $1 ORDER BY detected_at DESC, id DESC LIMIT 5", [companyId]),
      await q("SELECT signal_type, strength, detected_at FROM company_signals WHERE company_id = $1 ORDER BY detected_at DESC, id DESC LIMIT 10", [companyId]),
      await q("SELECT service, type, rationale FROM offer_recommendations WHERE company_id = $1 ORDER BY type = 'Primary' DESC, id", [companyId]),
      await q(
        `SELECT ct.first_name, ct.last_name, ct.job_title, ct.contact_role, ct.decision_maker_level
           FROM contacts ct JOIN contact_companies cc ON cc.contact_id = ct.id
          WHERE cc.company_id = $1 AND ct.deleted_at IS NULL ORDER BY ct.decision_maker_level = 'Primary Decision Maker' DESC, ct.id LIMIT 10`,
        [companyId],
      ),
      await q(
        `SELECT activity_type, actor_name, body, created_at FROM activities
          WHERE company_id = $1 AND activity_type IN ('note','call','email','outreach_sent','outreach_reply') ORDER BY created_at DESC LIMIT 8`,
        [companyId],
      ),
    ];
    return { company, ratings, pains, hiring, signals, offers, contacts, activity };
  });
  if (!data) {
    notes.push("That company was not found.");
    return {};
  }
  const { company: c, ratings, pains, hiring, signals, offers, contacts, activity } = data;

  const isProperty = s(c.company_type) === "Property";
  const location = join([c.city, c.state, c.country]);
  const address = join([c.address_line_1, c.address_line_2, c.city, c.state, c.zip, c.country]);
  const primaryParent = join([c.primary_operating_parent, c.primary_parent_reason ? `(${s(c.primary_parent_reason)})` : ""], " ");
  const stage = join([c.status_name, c.stage_name], " › ");
  const researched = date(c.last_researched);

  const ratingsText = lines(ratings.map((r) => `- ${RATING_CHANNEL[s(r.channel)] ?? s(r.channel)}: ${s(r.rating) || "no rating"}${r.review_count !== null ? ` (${s(r.review_count)} reviews)` : ""}${date(r.captured_at) ? `, checked ${date(r.captured_at)}` : ""}`));
  const painsText = lines(pains.map((r) => `- ${s(r.pain_type)} (detected ${date(r.detected_at)})`));
  const hiringText = lines(hiring.map((r) => `- ${join([r.role, r.job_title ? `"${s(r.job_title)}"` : ""], " — ")} (${join([r.strength, `detected ${date(r.detected_at)}`])})`));
  const signalsText = lines(signals.map((r) => `- ${s(r.signal_type)} (${join([r.strength, `detected ${date(r.detected_at)}`])})`));
  const offerText = lines(offers.map((r) => `- ${s(r.type)}: ${s(r.service)}${s(r.rationale) ? ` — ${s(r.rationale)}` : ""}`));
  const contactsText = lines(contacts.map((r) => `- ${join([r.first_name, r.last_name], " ")}${join([r.job_title || r.contact_role, r.decision_maker_level !== "Unknown" ? r.decision_maker_level : ""]) ? ` (${join([r.job_title || r.contact_role, r.decision_maker_level !== "Unknown" ? r.decision_maker_level : ""])})` : ""}`));
  const activityText = lines(activity.map((r) => `- ${date(r.created_at)} · ${s(r.activity_type)} · ${s(r.actor_name)}: ${s(r.body).replace(/\s+/g, " ").slice(0, 240)}`));

  const propertyFacts = isProperty
    ? facts([
        ["Property type", c.property_type],
        ["Star class", c.property_class && c.property_class !== "Unknown" ? c.property_class : ""],
        ["Rooms or units", c.rooms_units],
        ["Portfolio role", c.portfolio_role],
        ["Contactless", c.contactless ? "yes" : ""],
      ])
    : "";

  let fitText = "";
  try {
    const fit = (await fetchFitForCompany(companyId, [campaignId]))[String(campaignId)];
    if (fit?.label) fitText = lines([`${fit.label === "strong" ? "Strong" : fit.label === "partial" ? "Partial" : "Weak"} fit`, ...fit.lines.map((l) => `- ${l.criterion}: ${l.result} — ${l.text}`)]);
  } catch {
    notes.push("The fit with this campaign could not be worked out.");
  }

  const details = facts([
    ["Name", c.name],
    ["Type", c.company_type],
    ["Website", c.website],
    ["Location", address],
    ["Phone", c.phone],
    ["General email", c.email],
    ["Brand", c.brand_name],
    ["Ownership entity", c.ownership_entity],
    ["Operating entity", c.operating_entity],
    ["Management entity", c.management_entity],
    ["Parent company", c.parent_name],
    ["Primary operating parent", c.primary_operating_parent],
    ["Portfolio size", c.portfolio_size],
    ["Why now", c.sdr_signal_summary],
    ["Last researched", researched],
  ]);

  return {
    "company.name": s(c.name),
    "company.type": s(c.company_type),
    "company.website": s(c.website),
    "company.city": s(c.city),
    "company.location": location,
    "company.address": address,
    "company.phone": s(c.phone),
    "company.email": s(c.email),
    "company.brand": s(c.brand_name),
    "company.ownership": s(c.ownership_entity),
    "company.operator": s(c.operating_entity),
    "company.manager": s(c.management_entity),
    "company.parent": s(c.parent_name),
    "company.primary_parent": primaryParent,
    "company.portfolio_size": s(c.portfolio_size),
    "company.stage": stage,
    "company.tier": s(c.prospect_tier),
    "company.why_now": s(c.sdr_signal_summary),
    "company.summary": s(c.qualification_summary),
    "company.researched": researched,
    "company.fit": fitText,
    "company.contacts": contactsText,
    "company.activity": activityText,
    "property.type": isProperty ? s(c.property_type) : "",
    "property.class": isProperty && c.property_class !== "Unknown" ? s(c.property_class) : "",
    "property.rooms": isProperty ? s(c.rooms_units) : "",
    "property.portfolio_role": isProperty ? s(c.portfolio_role) : "",
    "property.contactless": isProperty && c.contactless ? "yes" : "",
    property: section("PROPERTY", propertyFacts),
    "company.ratings": ratingsText,
    "company.pain_signals": painsText,
    "company.hiring": hiringText,
    "company.signals": signalsText,
    "company.offer": offerText,
    company: lines([
      section("COMPANY", details),
      section("PROPERTY", propertyFacts),
      section("RATINGS", ratingsText),
      section("PAIN SIGNALS", painsText),
      section("HIRING SIGNALS", hiringText),
      section("OTHER SIGNALS", signalsText),
      section("RECOMMENDED OFFER", offerText),
    ].map((x) => (x ? `${x}\n` : ""))).trim(),
  };
}

// ---- what was already sent ----

async function sentSoFar(companyId: number, campaignId: string): Promise<string> {
  const rows = await query<{ step_position: number | null; step_day: number | null; channel: string; subject: string; body: string; sent_at: Date | null }>(
    "SELECT step_position, step_day, channel, subject, body, sent_at FROM campaign_messages WHERE company_id = $1 AND campaign_id = $2 AND status = 'sent' AND direction = 'out' ORDER BY sent_at, id",
    [companyId, campaignId],
  );
  return rows
    .map((r) => {
      const heading = join([r.step_position ? `Step ${r.step_position}` : "", r.channel, r.step_day ? `day ${r.step_day}` : "", r.sent_at ? `sent ${date(r.sent_at)}` : ""], " · ");
      return `${heading}\n${r.subject ? `Subject: ${r.subject}\n` : ""}${r.body}`;
    })
    .join("\n\n");
}

// ---- contact and sender ----

async function contactValues(companyId: number, choice: ContactChoice, notes: string[]): Promise<Record<string, string>> {
  if (!choice) return {};
  if (choice.kind === "company") {
    const [c] = await query<{ email: string | null; phone: string | null }>("SELECT email, phone FROM companies WHERE id = $1", [companyId]);
    return { contact: section("CONTACT", `General company contact, no named person.\n${facts([["Email", c?.email], ["Phone", c?.phone]])}`) };
  }
  const [ct] = await query<Row>(
    `SELECT ct.first_name, ct.last_name, ct.job_title, ct.contact_role, ct.decision_maker_level, ct.contact_line_type, ct.linkedin_url,
            (SELECT e.email FROM contact_emails e WHERE e.contact_id = ct.id ORDER BY e.is_primary DESC NULLS LAST, e.id LIMIT 1) AS email,
            (SELECT p.phone FROM contact_phones p WHERE p.contact_id = ct.id ORDER BY p.is_primary DESC NULLS LAST, p.id LIMIT 1) AS phone
       FROM contacts ct JOIN contact_companies cc ON cc.contact_id = ct.id
      WHERE ct.id = $1 AND cc.company_id = $2 AND ct.deleted_at IS NULL`,
    [choice.id, companyId],
  );
  if (!ct) {
    notes.push("That contact is not linked to this company.");
    return {};
  }
  const known = (v: unknown) => (s(v) && s(v) !== "Unknown" ? s(v) : "");
  const name = join([ct.first_name, ct.last_name], " ");
  return {
    "contact.name": name,
    "contact.first_name": s(ct.first_name),
    "contact.last_name": s(ct.last_name),
    "contact.title": s(ct.job_title),
    "contact.role": s(ct.contact_role),
    "contact.level": known(ct.decision_maker_level),
    "contact.line_type": known(ct.contact_line_type),
    "contact.email": s(ct.email),
    "contact.phone": s(ct.phone),
    "contact.linkedin": s(ct.linkedin_url),
    contact: section(
      "CONTACT",
      facts([
        ["Name", name],
        ["Job title", ct.job_title],
        ["Role", ct.contact_role],
        ["Decision maker level", known(ct.decision_maker_level)],
        ["Line", known(ct.contact_line_type)],
        ["Email", ct.email],
        ["Phone", ct.phone],
        ["LinkedIn", ct.linkedin_url],
      ]),
    ),
  };
}

function senderValues(a: ContextInput["actor"], signature: string): Record<string, string> {
  return {
    "sender.signature": s(signature),
    "sender.name": s(a.name),
    "sender.title": s(a.job_title),
    "sender.phone": s(a.phone),
    "sender.email": s(a.email),
    sender: section("SENDER", facts([["Name", a.name], ["Job title", a.job_title], ["Phone", a.phone], ["Email", a.email]])),
  };
}

// The signature that goes under the sender's emails: the one they wrote on their Profile, or their name.
async function senderSignature(a: ContextInput["actor"]): Promise<string> {
  return effectiveSignature(await fetchSignature(a.id), a.name);
}

// ---- everything ----

// For a campaign that is still being edited: the form's current content stands in for the saved campaign.
export async function buildValuesForDraft(input: { actor: ContextInput["actor"]; campaign: DraftCampaign; stepNumber: number; variants: number }): Promise<Record<string, string>> {
  const [knowledge, rules, signature] = await Promise.all([knowledgeValues(), fetchRules(), senderSignature(input.actor)]);
  return {
    ...knowledge,
    rules: rules.text,
    "generation.versions": String(input.variants),
    ...campaignValues(input.campaign, input.stepNumber),
    ...senderValues(input.actor, signature),
  };
}

export async function buildValues(input: ContextInput): Promise<ContextResult> {
  const notes: string[] = [];
  const [campaign, knowledge, rules, settings, signature] = await Promise.all([
    fetchCampaign(input.campaignId, input.campaignActor ?? input.actor),
    knowledgeValues(),
    fetchRules(),
    query<{ variants: number }>("SELECT variants FROM ai_settings WHERE id = 1"),
    senderSignature(input.actor),
  ]);
  if (!campaign) return { values: {}, notes: ["That campaign was not found."] };
  if (!campaign.steps[input.stepNumber - 1]) notes.push("That step does not exist in this campaign.");

  const values: Record<string, string> = {
    ...knowledge,
    rules: rules.text,
    "generation.versions": String(settings[0]?.variants ?? 2),
    ...campaignValues(campaign, input.stepNumber),
    ...senderValues(input.actor, signature),
  };

  if (input.companyId) {
    Object.assign(values, await companyValues(input.companyId, input.campaignId, notes));
    Object.assign(values, await contactValues(input.companyId, input.contact ?? null, notes));
  }
  // The baseline written for this step, and what was already sent to this company in this campaign.
  const step = campaign.steps[input.stepNumber - 1];
  if (step?.body?.trim() && (!input.expectChannel || step.channel === input.expectChannel)) {
    values["baseline.subject"] = s(step.subject);
    values["baseline.body"] = s(step.body);
    values.baseline = `${step.subject?.trim() ? `Subject: ${step.subject.trim()}\n\n` : ""}${step.body.trim()}`;
  }
  if (input.companyId) values.sent_so_far = await sentSoFar(input.companyId, input.campaignId);
  return { values, notes };
}

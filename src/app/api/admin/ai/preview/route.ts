import { NextResponse } from "next/server";
import { requireAdmin, isPromptKey, checkPromptBody } from "@/lib/ai/content";
import { buildValues, type ContactChoice } from "@/lib/ai/context";
import { renderTemplate } from "@/lib/ai/codes-format";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Fill in a prompt with real data so the admin can read exactly what the AI would be given. Nothing is sent to an AI service.
//   { key, text, campaign_id, step_number, company_id?, contact?: "company" | <contact id> }
// Admin only. The text is the prompt as it is in the editor, saved or not.
export async function POST(request: Request) {
  const actor = await requireAdmin();
  if (!actor) return fail("Only admins can preview prompts.", 403);

  const body = (await request.json().catch(() => ({}))) as { key?: unknown; text?: unknown; campaign_id?: unknown; step_number?: unknown; company_id?: unknown; contact?: unknown };
  if (typeof body.key !== "string" || !isPromptKey(body.key)) return fail("Unknown prompt.");
  const text = checkPromptBody(body.text);
  if ("error" in text) return fail(text.error);

  if (typeof body.campaign_id !== "string" || !/^\d+$/.test(body.campaign_id)) return fail("Choose a campaign.");
  const stepNumber = Number(body.step_number);
  if (!Number.isInteger(stepNumber) || stepNumber < 1) return fail("Choose a step.");

  const isCompanyPrompt = body.key.startsWith("company_");
  let companyId: number | null = null;
  let contact: ContactChoice = null;
  if (isCompanyPrompt) {
    companyId = Number(body.company_id);
    if (!Number.isInteger(companyId) || companyId < 1) return fail("Choose a company.");
    if (body.contact === "company") contact = { kind: "company" };
    else if (body.contact !== undefined && body.contact !== null && body.contact !== "") {
      const id = Number(body.contact);
      if (!Number.isInteger(id) || id < 1) return fail("Choose a contact.");
      contact = { kind: "contact", id };
    }
  }

  const { values, notes } = await buildValues({ actor, campaignId: body.campaign_id, stepNumber, companyId, contact });
  if (!Object.keys(values).length) return fail(notes[0] ?? "Could not build the prompt.", 404);

  const rendered = renderTemplate(text.value, values);
  return NextResponse.json({
    text: rendered.text,
    chars: rendered.text.length,
    tokens: Math.round(rendered.text.length / 4),
    empty: rendered.empty,
    unknown: rendered.unknown,
    notes,
  });
}

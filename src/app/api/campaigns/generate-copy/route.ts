import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { draftFromBody, generateBaseline, GenerateError } from "@/lib/ai/generate";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Write the baseline email for one step of a campaign that is being edited, using the form as it stands.
//   { campaign: { ...same fields as saving a campaign }, step_index, instruction? }
// Any signed-in person who can open the campaign form may use it. Each call counts against their daily limit.
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);

  const raw = await request.json().catch(() => ({}));
  const draft = draftFromBody(raw);
  if ("error" in draft) return fail(draft.error);
  const instruction = typeof (raw as { instruction?: unknown }).instruction === "string" ? (raw as { instruction: string }).instruction : "";

  try {
    const out = await generateBaseline({ actor, campaign: draft.campaign, stepNumber: draft.stepNumber, instruction });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof GenerateError) return fail(e.message, e.status);
    throw e;
  }
}

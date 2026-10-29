import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { GenerateError } from "@/lib/ai/generate";
import { generateForCompany } from "@/lib/ai/generate-company";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Write the email for one campaign task with AI, for that task's company and contact, starting from the campaign's baseline.
//   { instruction? }
// Allowed for whoever may work the task (the company's owner, the team lead, an admin). Counts against their daily limit.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);
  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid task");

  const body = (await request.json().catch(() => ({}))) as { instruction?: unknown };
  const instruction = typeof body.instruction === "string" ? body.instruction : "";

  try {
    return NextResponse.json(await generateForCompany({ actor, taskId: Number(id), instruction }));
  } catch (e) {
    if (e instanceof GenerateError) return fail(e.message, e.status);
    throw e;
  }
}

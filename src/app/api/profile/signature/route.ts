import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { saveSignature } from "@/lib/mail/signature";
import { SIGNATURE_MAX } from "@/lib/signature-format";

// Save the signature added to the end of the person's emails. An empty one clears it.
//   { signature }
export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { signature?: unknown };
  if (typeof b.signature !== "string") return NextResponse.json({ error: "Write the signature first." }, { status: 400 });
  const signature = b.signature.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (signature.length > SIGNATURE_MAX) return NextResponse.json({ error: `The signature must be ${SIGNATURE_MAX} characters or fewer.` }, { status: 400 });
  await saveSignature(user.id, signature);
  return NextResponse.json({ ok: true, signature });
}

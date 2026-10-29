import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getMailCredentials } from "@/lib/mail/account";
import { MailError, sendMail } from "@/lib/mail/gmail";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Send a short test email from the person's saved Gmail to that same address, so they can see it arrive.
export async function POST() {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);

  let creds: Awaited<ReturnType<typeof getMailCredentials>>;
  try {
    creds = await getMailCredentials(actor.id);
  } catch {
    return fail("The saved password can't be read. Save it again.", 500);
  }
  if (!creds) return fail("Add your Gmail address and app password first.");

  try {
    await sendMail({
      fromName: actor.name,
      fromAddress: creds.address,
      password: creds.password,
      to: creds.address,
      subject: "Guest Squad CRM: test email",
      text: "This is a test from Guest Squad CRM. Sending from your Gmail works.\n\nYou can delete this message.",
    });
  } catch (e) {
    return fail(e instanceof MailError ? e.message : "The test email could not be sent.", 502);
  }
  return NextResponse.json({ ok: true, to: creds.address });
}

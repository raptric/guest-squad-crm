import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { getMailCredentials } from "@/lib/mail/account";
import { looksLikeEmail, MailError, sendMail } from "@/lib/mail/gmail";
import { fetchSignature } from "@/lib/mail/signature";
import { leftoverPlaceholders } from "@/lib/campaign-messages-format";
import { emailHtml, mdToPlain } from "@/lib/rich-text";
import { dropTrailingName, effectiveSignature, withSignature } from "@/lib/signature-format";

const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

// Send an email to any address from the person's own Gmail, to see how it looks in a real inbox. It is built exactly like a real send
// (the signature is added, bold and bullets go out as HTML) but it is not tied to a task: nothing is marked done or recorded.
//   { to, subject, body }
export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);

  const b = (await request.json().catch(() => ({}))) as { to?: unknown; subject?: unknown; body?: unknown };
  const to = typeof b.to === "string" ? b.to.trim() : "";
  const subject = typeof b.subject === "string" ? b.subject.replace(/\s+/g, " ").trim() : "";
  const text = typeof b.body === "string" ? b.body.replace(/\r\n/g, "\n").trim() : "";
  if (!looksLikeEmail(to)) return fail("Enter a valid email address to send the test to.");
  if (!subject) return fail("Write a subject line first.");
  if (subject.length > 300) return fail("The subject must be 300 characters or fewer.");
  if (!text) return fail("Write the email first.");
  if (text.length > 10000) return fail("The email must be 10,000 characters or fewer.");
  const left = leftoverPlaceholders(`${subject}\n${text}`);
  if (left.length) return fail(`The email still has ${left.join(", ")} to fill in.`);

  let creds: Awaited<ReturnType<typeof getMailCredentials>>;
  try {
    creds = await getMailCredentials(actor.id);
  } catch {
    return fail("Your saved Gmail password can't be read. Add it again on your Profile.", 500, { needs_setup: true });
  }
  if (!creds) return fail("Add your Gmail address and app password on your Profile first.", 409, { needs_setup: true });

  const signature = effectiveSignature(await fetchSignature(actor.id), actor.name);
  const full = withSignature(dropTrailingName(text, [actor.name]), signature);
  try {
    await sendMail({ fromName: actor.name, fromAddress: creds.address, password: creds.password, to, subject: `[Test] ${subject}`, text: mdToPlain(full), html: emailHtml(full) });
  } catch (e) {
    return fail(e instanceof MailError ? e.message : "The test email could not be sent.", 502);
  }
  return NextResponse.json({ ok: true, to, from: creds.address });
}

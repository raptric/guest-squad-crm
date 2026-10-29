import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { aiSecretConfigured, encryptKey } from "@/lib/ai/crypto";
import { cleanPassword, looksLikeEmail, MAIL_PURPOSE, MailError, verifyAccount } from "@/lib/mail/gmail";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Save the signed-in person's Gmail address and app password. The login is tried first, and nothing is saved if Gmail refuses it.
//   { address, password }
export async function PUT(request: Request) {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);

  const body = (await request.json().catch(() => ({}))) as { address?: unknown; password?: unknown };
  const address = typeof body.address === "string" ? body.address.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? cleanPassword(body.password) : "";
  if (!looksLikeEmail(address)) return fail("Enter your Gmail address.");
  if (password.length < 12 || password.length > 64) return fail("That doesn't look like an app password. Google's are 16 letters.");
  if (!aiSecretConfigured()) return fail("This server has no AI_KEY_SECRET, so a password can't be saved here. Ask an admin to set it up.", 500);

  try {
    await verifyAccount(address, password);
  } catch (e) {
    return fail(e instanceof MailError ? e.message : "Couldn't check the login with Gmail.", 400);
  }

  await query(
    `INSERT INTO user_mail_accounts (user_id, gmail_address, password_enc) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET gmail_address = EXCLUDED.gmail_address, password_enc = EXCLUDED.password_enc, verified_at = now(), updated_at = now()`,
    [actor.id, address, encryptKey(password, MAIL_PURPOSE)],
  );
  return NextResponse.json({ ok: true });
}

// Remove it.
export async function DELETE() {
  const actor = await getCurrentUser();
  if (!actor) return fail("Unauthorized", 401);
  await query("DELETE FROM user_mail_accounts WHERE user_id = $1", [actor.id]);
  return NextResponse.json({ ok: true });
}

import { query } from "@/lib/db";
import { decryptKey } from "@/lib/ai/crypto";
import { MAIL_PURPOSE } from "./gmail";

// What the screens may know: whether a mail account is set up, and its address. Never the password.
export async function fetchMailAddress(userId: number | string): Promise<string | null> {
  const [row] = await query<{ gmail_address: string }>("SELECT gmail_address FROM user_mail_accounts WHERE user_id = $1", [userId]);
  return row?.gmail_address ?? null;
}

export async function fetchMailStatus(userId: number | string): Promise<{ address: string; verified_at: string } | null> {
  const [row] = await query<{ gmail_address: string; verified_at: string }>("SELECT gmail_address, verified_at FROM user_mail_accounts WHERE user_id = $1", [userId]);
  return row ? { address: row.gmail_address, verified_at: row.verified_at } : null;
}

// For the server about to send: the address and the decrypted password. Never sent to a browser.
export async function getMailCredentials(userId: number | string): Promise<{ address: string; password: string } | null> {
  const [row] = await query<{ gmail_address: string; password_enc: string }>("SELECT gmail_address, password_enc FROM user_mail_accounts WHERE user_id = $1", [userId]);
  if (!row) return null;
  return { address: row.gmail_address, password: decryptKey(row.password_enc, MAIL_PURPOSE) };
}

import { query } from "@/lib/db";

// The signature a person saved on their Profile ('' when none).
export async function fetchSignature(userId: number | string): Promise<string> {
  const [row] = await query<{ email_signature: string }>("SELECT email_signature FROM users WHERE id = $1", [userId]);
  return row?.email_signature ?? "";
}

export async function saveSignature(userId: number | string, signature: string): Promise<void> {
  await query("UPDATE users SET email_signature = $1 WHERE id = $2", [signature, userId]);
}

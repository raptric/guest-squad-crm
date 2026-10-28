import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// API keys are stored encrypted (AES-256-GCM). The secret lives only in the AI_KEY_SECRET env var, so someone who
// can read the database sees unreadable text. Stored format: v1.<iv>.<tag>.<ciphertext> (all base64url).
const PREFIX = "v1";

function secret(): Buffer {
  const raw = process.env.AI_KEY_SECRET;
  if (!raw) throw new Error("AI_KEY_SECRET is not set on this server, so API keys can't be saved or used here.");
  return createHash("sha256").update(raw).digest();
}

export function aiSecretConfigured(): boolean {
  return Boolean(process.env.AI_KEY_SECRET);
}

export function encryptKey(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptKey(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== PREFIX || !iv || !tag || !data) throw new Error("The saved API key is unreadable. Enter it again.");
  try {
    const decipher = createDecipheriv("aes-256-gcm", secret(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("The saved API key can't be decrypted on this server. Enter it again.");
  }
}

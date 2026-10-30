// The signature added to the end of every email a person sends from the CRM. Safe to import from the browser.

export const SIGNATURE_MAX = 1000;

// The signature that goes out: the one the person wrote on their Profile, or just their name when they have not written one.
export const effectiveSignature = (signature: string | null | undefined, name: string) => (signature ?? "").trim() || name.trim();

// A starting point for the Profile: name, job title, phone.
export const suggestedSignature = (p: { name: string; job_title?: string | null; phone?: string | null }) =>
  [p.name, p.job_title, p.phone].map((x) => (x ?? "").trim()).filter(Boolean).join("\n");

// Baselines written before signatures existed end with the sender's name ("Best,\n{sender_name}"). The signature already carries the
// name, so a last line that is only the name is dropped to keep it from appearing twice.
export function dropTrailingName(body: string, names: string[]): string {
  const known = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean).concat("{sender_name}"));
  const lines = body.replace(/\s+$/, "").split("\n");
  const last = lines[lines.length - 1]?.trim().toLowerCase().replace(/[,.\s]+$/, "");
  if (lines.length > 1 && last && known.has(last)) lines.pop();
  return lines.join("\n").replace(/\s+$/, "");
}

// Writing {{sender.signature}} in an email puts the signature at that spot instead of at the end.
const CODE = /\{\{\s*sender\.signature\s*\}\}/;
export const hasSignatureCode = (body: string) => CODE.test(body);

// The full text of an email: what was written, then the signature (a blank line between them), or the signature where the
// {{sender.signature}} code was written.
export function withSignature(body: string, signature: string): string {
  const sig = signature.trim();
  if (CODE.test(body)) return body.replace(new RegExp(CODE.source, "g"), () => sig).replace(/\n{3,}/g, "\n\n").trim();
  return sig ? `${body.trim()}\n\n${sig}` : body.trim();
}

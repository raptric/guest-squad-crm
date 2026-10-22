// Shared validation for the editable user-profile fields (self-service /api/profile and the
// admin edit in /api/admin/users/[id]). Blank phone / job title are stored as null.
export type ProfileInput = { name: string; phone: string | null; job_title: string | null };

export function parseProfileInput(body: unknown): { value: ProfileInput } | { error: string } {
  const { name, phone, job_title } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) return { error: "name is required" };
  if (name.trim().length > 255) return { error: "name is too long" };

  const optional = (v: unknown, max: number, label: string) => {
    if (v == null) return { value: null };
    if (typeof v !== "string") return { error: `${label} must be text` };
    const t = v.trim();
    if (t.length > max) return { error: `${label} must be ${max} characters or fewer` };
    return { value: t || null };
  };

  const p = optional(phone, 50, "phone");
  if ("error" in p) return { error: p.error as string };
  if (p.value && !/^[0-9+()\-.\s]+$/.test(p.value)) {
    return { error: "phone can only contain digits, spaces and + ( ) - ." };
  }
  const j = optional(job_title, 100, "job title");
  if ("error" in j) return { error: j.error as string };

  return { value: { name: name.trim(), phone: p.value, job_title: j.value } };
}

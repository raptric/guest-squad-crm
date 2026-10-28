import type { Client } from "pg";
import { z } from "zod";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { KNOWLEDGE_BODY_MAX, KNOWLEDGE_TOPICS, serviceKey } from "./knowledge-format";
import { PAIN_TYPES, ROLE_KEYS, withDefaults, type Rules, type RoleKey } from "./rules-format";

export type Kind = "knowledge" | "rules" | "example";

export async function requireAdmin() {
  const actor = await getCurrentUser();
  return actor && actor.role === "super_admin" ? actor : null;
}

// ---- Knowledge ----

export type KnowledgeEntry = { key: string; title: string; hint: string; rows: number; body: string; updated_at: string | null; updated_by: string | null };

export async function fetchServices(): Promise<string[]> {
  const rows = await query<{ value: string }>("SELECT value FROM picklist_values WHERE field_name = 'offer_service' AND is_active ORDER BY sort_order, value");
  return rows.map((r) => r.value);
}

export async function fetchKnowledge(): Promise<{ topics: KnowledgeEntry[]; services: KnowledgeEntry[] }> {
  const [services, rows] = await Promise.all([
    fetchServices(),
    query<{ key: string; body: string; updated_at: string; updated_by: string | null }>(
      "SELECT k.key, k.body, k.updated_at, u.name AS updated_by FROM ai_knowledge k LEFT JOIN users u ON u.id = k.updated_by",
    ),
  ]);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const entry = (key: string, title: string, hint: string, rowsN: number): KnowledgeEntry => {
    const r = byKey.get(key);
    return { key, title, hint, rows: rowsN, body: r?.body ?? "", updated_at: r?.updated_at ?? null, updated_by: r?.updated_by ?? null };
  };
  return {
    topics: KNOWLEDGE_TOPICS.map((t) => entry(t.key, t.title, t.hint, t.rows)),
    services: services.map((s) => entry(serviceKey(s), s, "What the hotel gets from this service, and which hotels it fits, in a few sentences.", 3)),
  };
}

// Is this a topic we know? Service topics must still exist in the Offer Service list.
export async function isKnowledgeKey(key: string): Promise<boolean> {
  if (KNOWLEDGE_TOPICS.some((t) => t.key === key)) return true;
  if (!key.startsWith("service:")) return false;
  return (await fetchServices()).includes(key.slice("service:".length));
}

export function checkKnowledgeBody(v: unknown): { error: string } | { value: string } {
  if (typeof v !== "string") return { error: "Write some text." };
  const body = v.replace(/\r\n/g, "\n").trim();
  if (body.length > KNOWLEDGE_BODY_MAX) return { error: `That is ${body.length.toLocaleString()} characters. Keep it under ${KNOWLEDGE_BODY_MAX.toLocaleString()}.` };
  return { value: body };
}

async function addVersion(client: Client, kind: Kind, ref: string, snapshot: unknown, userId: number | string | null) {
  await client.query("INSERT INTO ai_versions (kind, ref, snapshot, changed_by) VALUES ($1,$2,$3,$4)", [kind, ref, JSON.stringify(snapshot), userId]);
}

export async function saveKnowledge(client: Client, key: string, body: string, userId: number | string) {
  await client.query(
    `INSERT INTO ai_knowledge (key, body, updated_by) VALUES ($1,$2,$3)
     ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, body, userId],
  );
  await addVersion(client, "knowledge", key, { body }, userId);
}

// ---- Rules ----

const words = z.number().int().min(0).max(2000);
const list = z.array(z.string().trim().min(1).max(100)).max(100);
const role = z.object({ min: words, max: words, notes: z.string().max(600) }).refine((r) => r.min <= r.max, { message: "The minimum is higher than the maximum." });

const rulesSchema = z.object({
  roles: z.object(Object.fromEntries(ROLE_KEYS.map((k) => [k, role])) as Record<RoleKey, typeof role>),
  email: z
    .object({
      subjectMinWords: z.number().int().min(1).max(20),
      subjectMaxWords: z.number().int().min(1).max(20),
      lowercaseSubject: z.boolean(),
      noLinksInFirst: z.boolean(),
      plainTextOnly: z.boolean(),
      oneAsk: z.boolean(),
      personalHook: z.boolean(),
    })
    .refine((e) => e.subjectMinWords <= e.subjectMaxWords, { message: "The subject minimum is higher than its maximum." }),
  voice: z.string().max(2000),
  bannedPhrases: list,
  spamWords: list,
  painAngles: z.object(Object.fromEntries(PAIN_TYPES.map((p) => [p, z.string().max(300)]))),
  extra: z.string().max(3000),
  defaults: z.object({ variants: z.union([z.literal(1), z.literal(2), z.literal(3)]), creativity: z.enum(["low", "medium", "high"]) }),
});

export function checkRules(v: unknown): { error: string } | { value: Rules } {
  const r = rulesSchema.safeParse(v);
  if (!r.success) {
    const i = r.error.issues[0];
    return { error: `${i.path.join(" › ") || "Rules"}: ${i.message}` };
  }
  const d = r.data as Rules;
  // tidy the word lists: no blanks or repeats (case-insensitive)
  const tidy = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()];
  return { value: { ...d, bannedPhrases: tidy(d.bannedPhrases), spamWords: tidy(d.spamWords), voice: d.voice.trim(), extra: d.extra.trim() } };
}

export async function fetchRules(): Promise<{ rules: Rules; updated_at: string | null; updated_by: string | null }> {
  const [row] = await query<{ data: Partial<Rules>; updated_at: string; updated_by: string | null }>(
    "SELECT r.data, r.updated_at, u.name AS updated_by FROM ai_rules r LEFT JOIN users u ON u.id = r.updated_by WHERE r.id = 1",
  );
  return { rules: withDefaults(row?.data), updated_at: row?.updated_at ?? null, updated_by: row?.updated_by ?? null };
}

export async function saveRules(client: Client, rules: Rules, userId: number | string) {
  await client.query(
    `INSERT INTO ai_rules (id, data, updated_by) VALUES (1,$1,$2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [JSON.stringify(rules), userId],
  );
  await addVersion(client, "rules", "rules", { data: rules }, userId);
}

// ---- Examples ----

export type Example = { id: string; role: RoleKey; audience: string; subject: string; body: string; kind: "good" | "bad"; note: string };
export type ExampleInput = Omit<Example, "id">;

export async function fetchExamples(): Promise<Example[]> {
  return query<Example>("SELECT id::text, role, audience, subject, body, kind, note FROM ai_examples WHERE is_active ORDER BY kind DESC, role, id");
}

export async function fetchAudiences(): Promise<string[]> {
  const rows = await query<{ value: string }>("SELECT value FROM picklist_values WHERE field_name = 'company_type' AND is_active ORDER BY sort_order, value");
  return rows.map((r) => r.value);
}

export function checkExample(v: unknown): { error: string } | { value: ExampleInput } {
  const o = (v ?? {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x.replace(/\r\n/g, "\n").trim() : "");
  const exRole = str(o.role) as RoleKey;
  if (!ROLE_KEYS.includes(exRole)) return { error: "Choose what kind of step this is." };
  const kind = o.kind === "bad" ? "bad" : "good";
  const subject = str(o.subject);
  const body = str(o.body);
  const note = str(o.note);
  const audience = str(o.audience) || "any";
  if (!body) return { error: "Paste the text of the example." };
  if (body.length > 3000) return { error: "The example is too long. Keep it under 3,000 characters." };
  if (subject.length > 200) return { error: "The subject is too long." };
  if (note.length > 500) return { error: "The note is too long. Keep it under 500 characters." };
  if (audience.length > 60) return { error: "Choose an audience from the list." };
  return { value: { role: exRole, audience, subject, body, kind, note } };
}

const exampleSnapshot = (e: ExampleInput & { is_active: boolean }) => ({ role: e.role, audience: e.audience, subject: e.subject, body: e.body, kind: e.kind, note: e.note, is_active: e.is_active });

export async function createExample(client: Client, e: ExampleInput, userId: number | string): Promise<string> {
  const { rows } = await client.query("INSERT INTO ai_examples (role, audience, subject, body, kind, note, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id::text", [
    e.role,
    e.audience,
    e.subject,
    e.body,
    e.kind,
    e.note,
    userId,
  ]);
  await addVersion(client, "example", rows[0].id, exampleSnapshot({ ...e, is_active: true }), userId);
  return rows[0].id;
}

export async function updateExample(client: Client, id: string, e: ExampleInput, active: boolean, userId: number | string): Promise<boolean> {
  const { rowCount } = await client.query(
    "UPDATE ai_examples SET role=$2, audience=$3, subject=$4, body=$5, kind=$6, note=$7, is_active=$8, updated_by=$9, updated_at=now() WHERE id=$1",
    [id, e.role, e.audience, e.subject, e.body, e.kind, e.note, active, userId],
  );
  if (!rowCount) return false;
  await addVersion(client, "example", id, exampleSnapshot({ ...e, is_active: active }), userId);
  return true;
}

// ---- History ----

export type VersionRow = { id: string; kind: Kind; ref: string; snapshot: Record<string, unknown>; created_at: string; user_name: string | null; is_current: boolean };

export async function fetchVersions(kind: Kind, limit = 60): Promise<VersionRow[]> {
  return query<VersionRow>(
    `SELECT v.id::text, v.kind, v.ref, v.snapshot, v.created_at, u.name AS user_name,
            v.id = (SELECT max(id) FROM ai_versions x WHERE x.kind = v.kind AND x.ref = v.ref) AS is_current
       FROM ai_versions v LEFT JOIN users u ON u.id = v.changed_by
      WHERE v.kind = $1 ORDER BY v.id DESC LIMIT $2`,
    [kind, limit],
  );
}

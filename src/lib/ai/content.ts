import type { Client } from "pg";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { KNOWLEDGE_BODY_MAX, KNOWLEDGE_TOPICS, serviceKey } from "./knowledge-format";
import { PROMPTS, PROMPT_BODY_MAX, PROMPT_KEYS } from "./prompts-format";
import { DEFAULT_RULES_TEXT, RULES_TEXT_MAX, rulesText } from "./rules-format";

// "example" belongs to the Examples tab, which is switched off. Its old history rows are kept but can't be restored.
export type Kind = "knowledge" | "rules" | "prompt" | "example";

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

export function checkRulesText(v: unknown): { error: string } | { value: string } {
  if (typeof v !== "string") return { error: "Write the rules." };
  const text = v.replace(/\r\n/g, "\n").trim();
  if (!text) return { error: "The rules can't be empty." };
  if (text.length > RULES_TEXT_MAX) return { error: `That is ${text.length.toLocaleString()} characters. Keep it under ${RULES_TEXT_MAX.toLocaleString()}.` };
  return { value: text };
}

export async function fetchRules(): Promise<{ text: string; updated_at: string | null; updated_by: string | null }> {
  const [row] = await query<{ data: unknown; updated_at: string; updated_by: string | null }>(
    "SELECT r.data, r.updated_at, u.name AS updated_by FROM ai_rules r LEFT JOIN users u ON u.id = r.updated_by WHERE r.id = 1",
  );
  return { text: row ? rulesText(row.data) : DEFAULT_RULES_TEXT, updated_at: row?.updated_at ?? null, updated_by: row?.updated_by ?? null };
}

export async function saveRules(client: Client, text: string, userId: number | string) {
  await client.query(
    `INSERT INTO ai_rules (id, data, updated_by) VALUES (1,$1,$2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [JSON.stringify({ text }), userId],
  );
  await addVersion(client, "rules", "rules", { data: { text } }, userId);
}

// ---- Prompts ----

export type PromptEntry = { key: string; body: string; updated_at: string | null; updated_by: string | null };

// Every prompt, in display order. One that was never saved shows its starting text.
export async function fetchPrompts(): Promise<PromptEntry[]> {
  const rows = await query<{ key: string; body: string; updated_at: string; updated_by: string | null }>(
    "SELECT p.key, p.body, p.updated_at, u.name AS updated_by FROM ai_prompts p LEFT JOIN users u ON u.id = p.updated_by",
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return PROMPTS.map((p) => {
    const r = byKey.get(p.key);
    return { key: p.key, body: r?.body ?? p.defaultBody, updated_at: r?.updated_at ?? null, updated_by: r?.updated_by ?? null };
  });
}

export const isPromptKey = (key: string) => PROMPT_KEYS.includes(key);

export function checkPromptBody(v: unknown): { error: string } | { value: string } {
  if (typeof v !== "string") return { error: "Write the prompt." };
  const body = v.replace(/\r\n/g, "\n").trim();
  if (!body) return { error: "The prompt can't be empty." };
  if (body.length > PROMPT_BODY_MAX) return { error: `That is ${body.length.toLocaleString()} characters. Keep it under ${PROMPT_BODY_MAX.toLocaleString()}.` };
  return { value: body };
}

export async function savePrompt(client: Client, key: string, body: string, userId: number | string) {
  await client.query(
    `INSERT INTO ai_prompts (key, body, updated_by) VALUES ($1,$2,$3)
     ON CONFLICT (key) DO UPDATE SET body = EXCLUDED.body, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, body, userId],
  );
  await addVersion(client, "prompt", key, { body }, userId);
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

import { query } from "@/lib/db";
import type { BatchState } from "./status";

// Shared by the Scraper Monitor list and the campaign detail page.
export const RECEIVING_MS = 15 * 60 * 1000;
export const STALE_MS = 24 * 60 * 60 * 1000;

export type BatchRow = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  country: string | null;
  state: string | null;
  city: string | null;
  notes: string | null;
  origin: "scraper" | "backfill";
  status: "open" | "completed";
  completed_at: Date | null;
  completed_by: string | null;
  created_at: Date;
  companies: number;
  last_company: Date | null;
  with_website: number;
  with_phone: number;
  with_email: number;
};

// One query for all campaigns, or a single one when an id is given.
export async function fetchBatches(id?: string): Promise<BatchRow[]> {
  return query<BatchRow>(
    `SELECT b.id, b.campaign_id, b.campaign_name, b.country, b.state, b.city, b.notes, b.origin, b.status,
            b.completed_at, b.completed_by, b.created_at,
            count(c.id)::int AS companies, max(c.created_at) AS last_company,
            count(c.website)::int AS with_website, count(c.phone)::int AS with_phone, count(c.email)::int AS with_email
       FROM import_batches b
       LEFT JOIN companies c ON c.import_batch_id = b.id AND c.deleted_at IS NULL
      WHERE ($1::bigint IS NULL OR b.id = $1::bigint)
      GROUP BY b.id
      ORDER BY greatest(max(c.created_at), b.created_at) DESC`,
    [id ?? null]
  );
}

export async function fetchLastPushes(): Promise<Map<string, Date>> {
  const rows = await query<{ batch_id: string; last_push: Date }>(
    `SELECT batch_id, max(created_at) AS last_push FROM import_push_log WHERE batch_id IS NOT NULL GROUP BY batch_id`
  );
  return new Map(rows.map((r) => [String(r.batch_id), r.last_push]));
}

// Last real data: newest company or push. A campaign with neither yet falls back to when it was
// created, so a brand-new empty campaign isn't instantly "stale".
export function deriveState(b: BatchRow, lastPush: Date | undefined, now = Date.now()) {
  const lastActivity =
    Math.max(b.last_company ? new Date(b.last_company).getTime() : 0, lastPush ? new Date(lastPush).getTime() : 0) ||
    new Date(b.created_at).getTime();
  const state: BatchState =
    b.status === "completed"
      ? "completed"
      : now - lastActivity < RECEIVING_MS
        ? "receiving"
        : now - lastActivity < STALE_MS
          ? "active"
          : "stale";
  // New companies landing in a campaign an admin/scraper already closed.
  const dataAfterCompleted = Boolean(
    b.status === "completed" && b.origin === "scraper" && b.completed_at && b.last_company &&
      new Date(b.last_company) > new Date(b.completed_at)
  );
  return { lastActivity, state, dataAfterCompleted };
}

export const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : null);
export const abs = (d: Date | string | null) => (d ? new Date(d).toUTCString() : "");

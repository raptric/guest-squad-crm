import { Client } from "pg";

function newClient() {
  return new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
}

export type AuditStatus = "applied" | "already_applied" | "needs_review" | "failed";

export type ReserveResult =
  | { outcome: "replay"; status: AuditStatus; response: unknown }
  | { outcome: "blocked" }
  | { outcome: "proceed"; auditEventId: number };

// Call BEFORE opening the write transaction. The reservation INSERT's unique index on
// idempotency_key is the actual mutex: only one caller can win it for a given key. A prior
// 'applied' or 'needs_review' row means this exact request already ran -- replay its stored
// response rather than doing the work again. A prior 'failed' row means nothing was actually
// written (the transaction that would have finalized it rolled back), so it's safe to retry:
// reset it to 'in_progress' and proceed. A row still 'in_progress' means a concurrent call with
// the same key is mid-flight right now -- refuse rather than race it.
export async function reserveIdempotencyKey(
  toolName: string,
  actorName: string,
  companyId: number | null,
  idempotencyKey: string,
  request: unknown
): Promise<ReserveResult> {
  const client = newClient();
  await client.connect();
  try {
    try {
      const { rows } = await client.query(
        `INSERT INTO mcp_audit_log (tool_name, actor_name, company_id, idempotency_key, status, request)
         VALUES ($1, $2, $3, $4, 'in_progress', $5) RETURNING id`,
        [toolName, actorName, companyId, idempotencyKey, JSON.stringify(request)]
      );
      return { outcome: "proceed", auditEventId: Number(rows[0].id) };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }

    const { rows } = await client.query(
      "SELECT id, status, response, now() - created_at AS age FROM mcp_audit_log WHERE idempotency_key = $1",
      [idempotencyKey]
    );
    const existing = rows[0] as {
      id: number;
      status: AuditStatus | "in_progress";
      response: unknown;
      age: { days?: number; hours?: number; minutes?: number };
    } | undefined;
    if (!existing) throw new Error(`Idempotency reservation for "${idempotencyKey}" disappeared unexpectedly`);

    if (existing.status === "applied" || existing.status === "needs_review") {
      return { outcome: "replay", status: existing.status, response: existing.response };
    }
    // A process that dies mid-transaction (crash, redeploy) leaves the row stuck in_progress
    // forever with nothing to ever finalize it -- without a staleness cutoff that permanently
    // blocks every retry of this key. Five minutes is generously longer than any single
    // research-writeback transaction should take. pg only includes non-zero interval fields.
    const staleMinutes = (existing.age?.days ?? 0) * 24 * 60 + (existing.age?.hours ?? 0) * 60 + (existing.age?.minutes ?? 0);
    if (existing.status === "in_progress" && staleMinutes < 5) return { outcome: "blocked" };

    // status === 'failed', or a stale abandoned 'in_progress' reservation: safe to retry.
    await client.query(
      `UPDATE mcp_audit_log SET status = 'in_progress', request = $2, created_at = now() WHERE idempotency_key = $1`,
      [idempotencyKey, JSON.stringify(request)]
    );
    return { outcome: "proceed", auditEventId: existing.id };
  } finally {
    await client.end();
  }
}

// Call as the LAST statement inside the same transaction, right before it commits, so success
// and its audit record land atomically together.
export async function finalizeAuditInTransaction(
  client: Client,
  idempotencyKey: string,
  status: AuditStatus,
  response: unknown,
  warnings: string[]
) {
  await client.query(
    `UPDATE mcp_audit_log SET status = $2, response = $3, warnings = $4 WHERE idempotency_key = $1`,
    [idempotencyKey, status, JSON.stringify(response), JSON.stringify(warnings)]
  );
}

// Call after the transaction has rolled back (a fresh connection -- the transactional one is
// already closed by then), so the failure is visible and the key becomes retryable.
export async function markAuditFailed(idempotencyKey: string, errorMessage: string) {
  const client = newClient();
  await client.connect();
  try {
    await client.query(
      `UPDATE mcp_audit_log SET status = 'failed', response = $2, warnings = '[]'
       WHERE idempotency_key = $1 AND status = 'in_progress'`,
      [idempotencyKey, JSON.stringify({ error: errorMessage })]
    );
  } finally {
    await client.end();
  }
}

// Non-idempotency-key mutations (the pre-existing simple tools, and add/remove_offer_recommendation) still get a
// structured audit row -- just without the reservation/replay machinery.
export async function recordSimpleAudit(entry: {
  toolName: string;
  actorName: string;
  companyId: number | null;
  status: AuditStatus;
  request: unknown;
  response: unknown;
  warnings?: string[];
}) {
  const client = newClient();
  await client.connect();
  try {
    await client.query(
      `INSERT INTO mcp_audit_log (tool_name, actor_name, company_id, status, request, response, warnings)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.toolName,
        entry.actorName,
        entry.companyId,
        entry.status,
        JSON.stringify(entry.request),
        JSON.stringify(entry.response),
        JSON.stringify(entry.warnings ?? []),
      ]
    );
  } finally {
    await client.end();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

import { Client } from "pg";

// Supabase's JS client talks over PostgREST -- every .from().insert()/.update() call is its own
// independent request, with no way to group them into one database transaction. Real atomicity
// (apply_research_result must not partially apply) needs a direct Postgres connection instead.
// One Client per call, closed when done -- the right shape for a serverless function, not a
// long-lived pool spanning invocations.
export async function withTransaction<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

// Postgres unique_violation.
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

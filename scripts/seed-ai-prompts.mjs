// One-off seed for Settings -> AI -> Prompts: saves the four starting prompts so they appear in the history as the first
// version. Safe to run again: it only fills prompts that were never saved.
// Usage: node scripts/seed-ai-prompts.mjs
import { Client } from "pg";
import { config } from "dotenv";
import { PROMPTS } from "../src/lib/ai/prompts-format.ts";

config({ path: ".env.local" });

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
try {
  await pg.query("BEGIN");
  for (const p of PROMPTS) {
    if ((await pg.query("SELECT 1 FROM ai_prompts WHERE key = $1", [p.key])).rowCount) continue;
    await pg.query("INSERT INTO ai_prompts (key, body) VALUES ($1, $2)", [p.key, p.defaultBody]);
    await pg.query("INSERT INTO ai_versions (kind, ref, snapshot, changed_by) VALUES ('prompt', $1, $2, NULL)", [p.key, JSON.stringify({ body: p.defaultBody })]);
    console.log("seeded", p.key);
  }
  await pg.query("COMMIT");
} catch (e) {
  await pg.query("ROLLBACK");
  throw e;
} finally {
  await pg.end();
}

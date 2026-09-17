// One-off runner: applies a single migration file to DATABASE_URL.
// Usage: node scripts/apply-migration.mjs supabase/migrations/0002_link_users_to_auth.sql
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <path-to-migration.sql>");
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sql = readFileSync(file, "utf8");

await client.connect();
console.log(`Applying ${file}...`);
await client.query(sql);
console.log("Done.");
await client.end();

// One-off seed: creates the first super admin (Supabase Auth user + linked `users` row).
// Usage: ADMIN_NAME="..." ADMIN_EMAIL="..." ADMIN_PASSWORD="..." node scripts/seed-super-admin.mjs
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const name = process.env.ADMIN_NAME;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!name || !email || !password) {
  console.error(
    "Usage: ADMIN_NAME=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-super-admin.mjs"
  );
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const pg = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await pg.connect();

  const existing = await pg.query(
    `SELECT id FROM users WHERE role = 'super_admin' LIMIT 1`
  );
  if (existing.rows.length > 0) {
    console.log("A super admin already exists. Not creating another one.");
    await pg.end();
    return;
  }

  console.log(`Creating auth user for ${email}...`);
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw new Error(`Failed to create auth user: ${error.message}`);
  }

  console.log("Linking users row with role = super_admin...");
  await pg.query(
    `INSERT INTO users (name, email, auth_user_id, role)
     VALUES ($1, $2, $3, 'super_admin')`,
    [name, email, data.user.id]
  );

  console.log(`Super admin created: ${email}`);
  await pg.end();
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});

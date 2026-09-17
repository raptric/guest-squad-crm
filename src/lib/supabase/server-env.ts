// Server-only: unlike the browser client, server code can read any env var, so this
// prefers Vercel's Supabase-integration names (guaranteed populated when the integration
// is connected) and falls back to our own manually-set names otherwise.
export const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabaseServiceRoleKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;

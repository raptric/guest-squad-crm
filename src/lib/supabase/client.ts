import { createBrowserClient } from "@supabase/ssr";

// Browser code can only read NEXT_PUBLIC_-prefixed vars (Next.js inlines them at build
// time) -- falls back between our own names and Vercel's Supabase-integration names in
// case only one set is actually populated.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient() {
  return createBrowserClient(supabaseUrl!, supabaseKey!);
}

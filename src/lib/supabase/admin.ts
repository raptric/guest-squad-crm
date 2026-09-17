import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseServiceRoleKey } from "./server-env";

// Service-role client: bypasses RLS, never import this into client components.
export function createAdminClient() {
  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

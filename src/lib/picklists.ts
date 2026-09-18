import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Works with any Supabase client instance -- the cookie-based server client in pages, or
// the service-role admin client in machine-to-machine API routes (ingest, MCP).
export async function fetchPicklistValues(supabase: SupabaseClient, fieldName: string): Promise<string[]> {
  const { data } = await supabase
    .from("picklist_values")
    .select("value")
    .eq("field_name", fieldName)
    .eq("is_active", true)
    .order("sort_order");

  return data?.map((row) => row.value) ?? [];
}

// Convenience wrapper for server components/pages, which already use the cookie-based client.
export async function getPicklistValues(fieldName: string): Promise<string[]> {
  const supabase = await createClient();
  return fetchPicklistValues(supabase, fieldName);
}

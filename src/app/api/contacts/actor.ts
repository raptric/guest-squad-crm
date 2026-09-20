import type { SupabaseClient } from "@supabase/supabase-js";
import type { Actor } from "@/lib/contacts";

// The signed-in person making the request; verification and provenance are attributed to them.
export async function getHumanActor(supabase: SupabaseClient): Promise<Actor | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("users").select("id, name").eq("auth_user_id", user.id).single();
  return { type: "human", name: profile?.name ?? user.email ?? "User", userId: profile ? Number(profile.id) : null };
}

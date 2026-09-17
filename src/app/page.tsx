import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("users")
    .select("name, role")
    .eq("auth_user_id", user?.id)
    .single();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Guest Squad CRM</h1>
        <p className="text-sm text-zinc-600">
          Signed in as <span className="font-medium">{profile?.name ?? user?.email}</span>
          {profile?.role ? ` (${profile.role})` : ""}
        </p>
        <LogoutButton />
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_CHIP, roleLabel } from "@/lib/roles";
import { CreateUserForm } from "./create-user-form";
import { TeamsPanel } from "./teams-panel";
import { UserActions, type UserStatus } from "./user-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<UserStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-800" },
  pending: { label: "Invite pending", className: "bg-amber-100 text-amber-800" },
  blocked: { label: "Blocked", className: "bg-red-100 text-red-800" },
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "super_admin") {
    redirect("/");
  }
  const tab = (await searchParams).tab === "teams" ? "teams" : "users";

  const supabase = await createClient();
  const [{ data: users }, { data: teams }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role, team_id, phone, job_title, auth_user_id, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("teams").select("id, name").order("name"),
  ]);
  const teamList = teams ?? [];
  const teamName = new Map(teamList.map((t) => [t.id, t.name]));

  // Sign-in state lives in Supabase Auth (accepted invite / banned), not in our users table.
  const { data: authList } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  const authById = new Map((authList?.users ?? []).map((u) => [u.id, u]));

  const statusOf = (authUserId: string | null): UserStatus => {
    const auth = authUserId ? authById.get(authUserId) : undefined;
    if (auth?.banned_until && new Date(auth.banned_until) > new Date()) return "blocked";
    return auth?.email_confirmed_at ? "active" : "pending";
  };

  const teamRows = teamList.map((t) => ({
    id: t.id,
    name: t.name,
    memberCount: (users ?? []).filter((u) => u.team_id === t.id).length,
    lead: (users ?? []).find((u) => u.team_id === t.id && u.role === "team_lead")?.name ?? null,
  }));

  const tabClass = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm font-medium ${active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Users &amp; teams</h1>
        <p className="text-sm text-zinc-500">Invite people, set their role, and organise them into teams.</p>
      </div>

      <div className="flex gap-2">
        <Link href="/users" className={tabClass(tab === "users")}>
          Users ({users?.length ?? 0})
        </Link>
        <Link href="/users?tab=teams" className={tabClass(tab === "teams")}>
          Teams ({teamList.length})
        </Link>
      </div>

      {tab === "teams" ? (
        <TeamsPanel teams={teamRows} />
      ) : (
        <div className="space-y-8">
          <CreateUserForm teams={teamList} />

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">Email</th>
                <th className="py-2 pr-4 font-medium">Role</th>
                <th className="py-2 pr-4 font-medium">Team</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((u) => {
                const status = statusOf(u.auth_user_id);
                const badge = STATUS_BADGE[status];
                return (
                  <tr key={u.id} className="border-b border-zinc-100 align-top">
                    <td className="py-3 pr-4 text-zinc-900">
                      {u.name}
                      {u.job_title && <div className="text-xs text-zinc-500">{u.job_title}</div>}
                    </td>
                    <td className="py-3 pr-4 text-zinc-600">
                      {u.email}
                      {u.phone && <div className="text-xs text-zinc-500">{u.phone}</div>}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ROLE_CHIP[u.role] ?? "bg-zinc-100 text-zinc-700"}`}>
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600">
                      {u.team_id ? teamName.get(u.team_id) : <span className="text-zinc-400">{u.role === "super_admin" ? "All teams" : "No team"}</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="py-3">
                      <UserActions
                        userId={u.id}
                        name={u.name}
                        email={u.email}
                        phone={u.phone ?? ""}
                        jobTitle={u.job_title ?? ""}
                        role={u.role}
                        teamId={u.team_id}
                        teams={teamList}
                        status={status}
                        isSelf={Number(u.id) === Number(currentUser?.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

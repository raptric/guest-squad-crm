import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateUserForm } from "./create-user-form";
import { UserActions, type UserStatus } from "./user-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<UserStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-800" },
  pending: { label: "Invite pending", className: "bg-amber-100 text-amber-800" },
  blocked: { label: "Blocked", className: "bg-red-100 text-red-800" },
};

export default async function UsersPage() {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "super_admin") {
    redirect("/");
  }

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, role, phone, job_title, auth_user_id, created_at")
    .order("created_at", { ascending: false });

  // Sign-in state lives in Supabase Auth (accepted invite / banned), not in our users table.
  const { data: authList } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  const authById = new Map((authList?.users ?? []).map((u) => [u.id, u]));

  const statusOf = (authUserId: string | null): UserStatus => {
    const auth = authUserId ? authById.get(authUserId) : undefined;
    if (auth?.banned_until && new Date(auth.banned_until) > new Date()) return "blocked";
    return auth?.email_confirmed_at ? "active" : "pending";
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Users</h1>
        <p className="text-sm text-zinc-500">Invite teammates and manage roles.</p>
      </div>

      <CreateUserForm />

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Email</th>
            <th className="py-2 pr-4 font-medium">Role</th>
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
                <td className="py-3 pr-4 text-zinc-600">{u.role}</td>
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
                    status={status} isSelf={Number(u.id) === Number(currentUser?.id)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

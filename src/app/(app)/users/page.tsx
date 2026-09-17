import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { createClient } from "@/lib/supabase/server";
import { CreateUserForm } from "./create-user-form";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const currentUser = await getCurrentUser();
  if (currentUser?.role !== "super_admin") {
    redirect("/");
  }

  const supabase = await createClient();
  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, role, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Users</h1>
        <p className="text-sm text-zinc-500">Invite teammates and manage roles.</p>
      </div>

      <CreateUserForm />

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-zinc-500">
            <th className="py-2 font-medium">Name</th>
            <th className="py-2 font-medium">Email</th>
            <th className="py-2 font-medium">Role</th>
          </tr>
        </thead>
        <tbody>
          {users?.map((u) => (
            <tr key={u.id} className="border-b border-zinc-100">
              <td className="py-2 text-zinc-900">{u.name}</td>
              <td className="py-2 text-zinc-600">{u.email}</td>
              <td className="py-2 text-zinc-600">{u.role}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

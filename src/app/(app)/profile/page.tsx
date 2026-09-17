import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-sm space-y-6 p-8">
      <h1 className="text-xl font-semibold text-zinc-900">Profile</h1>
      <ProfileForm name={user.name} email={user.email} role={user.role} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { aiSecretConfigured } from "@/lib/ai/crypto";
import { fetchMailStatus } from "@/lib/mail/account";
import { ProfileForm } from "./profile-form";
import { MailSettings } from "./mail-settings";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const mail = await fetchMailStatus(user.id);

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 p-8">
      <h1 className="text-xl font-semibold text-zinc-900">Profile</h1>
      <div className="max-w-sm">
        <ProfileForm name={user.name} email={user.email} role={user.role} phone={user.phone ?? ""} jobTitle={user.job_title ?? ""} />
      </div>
      <MailSettings saved={mail ? { address: mail.address, verified_at: String(mail.verified_at) } : null} secretReady={aiSecretConfigured()} />
    </div>
  );
}

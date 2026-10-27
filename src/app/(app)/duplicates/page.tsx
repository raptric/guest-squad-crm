import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { canAssign } from "@/lib/assignment";
import { recentDeletions } from "@/lib/duplicates";
import { DuplicatesView } from "./duplicates-view";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const actor = await getCurrentUser();
  if (!actor) redirect("/login");
  // Admins and team leads only.
  if (!canAssign(actor)) redirect("/");

  const recent = (await recentDeletions(actor)).map((d) => ({
    id: d.id,
    keptId: d.kept_id,
    keptName: d.kept_name,
    by: d.deleted_by_name,
    when: new Date(d.created_at).toISOString(),
    names: d.names,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Duplicates</h1>
        <p className="text-sm text-zinc-500">
          Companies with the same name and the same phone number or address are grouped here. Pick the one to keep and delete the others. Deleted copies can be restored.
          {actor.role === "super_admin" ? "" : " You see the companies in your team."}
        </p>
      </div>
      <DuplicatesView recent={recent} />
    </div>
  );
}

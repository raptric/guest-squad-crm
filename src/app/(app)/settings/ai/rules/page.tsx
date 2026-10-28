import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchRules } from "@/lib/ai/content";
import { AiHeader } from "../ai-header";
import { RulesPanel } from "./rules-panel";

export const dynamic = "force-dynamic";

// Settings -> AI -> Writing rules. Admin only: how the AI must write.
export default async function WritingRulesPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const { rules, updated_at, updated_by } = await fetchRules();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-8">
      <AiHeader description="How the AI must write: length, structure, voice, and the words it must never use." />
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">Change what you need and click Save at the bottom. Every save is kept in the history.</p>
        <Link href="/settings/ai/history?kind=rules" className="text-sm text-sky-700 hover:underline">
          History
        </Link>
      </div>
      <RulesPanel initial={rules} updatedAt={updated_at} updatedBy={updated_by} />
    </div>
  );
}

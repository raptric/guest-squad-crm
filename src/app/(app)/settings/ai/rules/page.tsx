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

  const { text, updated_at, updated_by } = await fetchRules();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-8">
      <AiHeader description="How the AI must write: voice, structure, and the words it must never use." />
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">One text box. Every save is kept in the history.</p>
        <Link href="/settings/ai/history?kind=rules" className="text-sm text-sky-700 hover:underline">
          History
        </Link>
      </div>
      <RulesPanel initial={text}updatedAt={updated_at} updatedBy={updated_by} />
    </div>
  );
}

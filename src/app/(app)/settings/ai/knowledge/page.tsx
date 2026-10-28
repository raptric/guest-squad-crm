import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchKnowledge } from "@/lib/ai/content";
import { AiHeader } from "../ai-header";
import { KnowledgeCard } from "./knowledge-card";

export const dynamic = "force-dynamic";

// Settings -> AI -> Knowledge. Admin only: what the AI is told about GuestSquad.
export default async function KnowledgePage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const { topics, services } = await fetchKnowledge();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-8">
      <AiHeader description="What the AI knows about GuestSquad. It only uses what is written here, so anything left empty is simply not mentioned." />

      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">Each box saves on its own. Every change is kept in the history.</p>
        <Link href="/settings/ai/history?kind=knowledge" className="text-sm text-sky-700 hover:underline">
          History
        </Link>
      </div>

      <div className="space-y-4">
        {topics.map((t) => (
          <KnowledgeCard key={t.key} entry={t} />
        ))}
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Services</h2>
          <p className="text-sm text-zinc-500">
            One box for each service in the Offer Service list (Settings → Lists). Add or rename services there.
          </p>
        </div>
        {services.map((s) => (
          <KnowledgeCard key={s.key} entry={s} />
        ))}
      </section>
    </div>
  );
}

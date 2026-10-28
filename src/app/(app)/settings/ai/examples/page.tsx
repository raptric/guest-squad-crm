import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchAudiences, fetchExamples } from "@/lib/ai/content";
import { AiHeader } from "../ai-header";
import { ExamplesPanel } from "./examples-panel";

export const dynamic = "force-dynamic";

// Settings -> AI -> Examples. Admin only: real copy the AI learns the style from, and bad copy it avoids.
export default async function ExamplesPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const [examples, audiences] = await Promise.all([fetchExamples(), fetchAudiences()]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-8">
      <AiHeader description="Your best real emails, scripts and messages. The AI copies their style. Add bad ones too, so it knows what to avoid." />
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-600">Two to five good examples for each kind of step work best.</p>
        <Link href="/settings/ai/history?kind=example" className="text-sm text-sky-700 hover:underline">
          History
        </Link>
      </div>
      <ExamplesPanel examples={examples} audiences={audiences} />
    </div>
  );
}

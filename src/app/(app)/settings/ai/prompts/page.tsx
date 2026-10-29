import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchPrompts } from "@/lib/ai/content";
import { PROMPTS } from "@/lib/ai/prompts-format";
import { AiHeader } from "../ai-header";
import { PromptCard } from "./prompt-card";

export const dynamic = "force-dynamic";

// Settings -> AI -> Prompts. Admin only: the instructions the AI is given for each kind of email.
export default async function PromptsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const entries = await fetchPrompts();
  const entry = (key: string) => entries.find((e) => e.key === key)!;
  const groups = [
    { title: "Campaign emails", hint: "Used while building a campaign. They write the reusable baseline for a step, with placeholders such as {first_name}.", group: "campaign" as const },
    { title: "Company emails", hint: "Used on a company's task. They adapt the baseline for that one company, using what the CRM knows about it.", group: "company" as const },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-8">
      <AiHeader description="The instructions the AI is given for each kind of email. Knowledge, rules and campaign details are pulled in with short codes." />

      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-zinc-600">
          Words in double braces, such as <span className="font-mono text-xs">{"{{knowledge}}"}</span>, are filled in by the CRM before the prompt is sent. Single braces, such as <span className="font-mono text-xs">{"{first_name}"}</span>, are placeholders the AI writes into a baseline. The CRM adds the reply format and the &quot;use only the facts given&quot; rule after your text. The list of codes is the next step.
        </p>
        <Link href="/settings/ai/history?kind=prompt" className="shrink-0 text-sm text-sky-700 hover:underline">
          History
        </Link>
      </div>

      {groups.map((g) => (
        <section key={g.group} className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">{g.title}</h2>
            <p className="text-sm text-zinc-500">{g.hint}</p>
          </div>
          {PROMPTS.filter((p) => p.group === g.group).map((p) => (
            <PromptCard key={p.key} def={{ key: p.key, title: p.title, when: p.when, defaultBody: p.defaultBody }} entry={entry(p.key)} />
          ))}
        </section>
      ))}
    </div>
  );
}

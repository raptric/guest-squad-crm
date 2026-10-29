import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { query } from "@/lib/db";
import { fetchPrompts } from "@/lib/ai/content";
import { AiHeader } from "../ai-header";
import { PromptsWorkspace, type PreviewCampaign } from "./prompts-workspace";

export const dynamic = "force-dynamic";

// Settings -> AI -> Prompts. Admin only: the instructions the AI is given for each kind of email, and the short codes they use.
export default async function PromptsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const [entries, campaigns] = await Promise.all([
    fetchPrompts(),
    query<PreviewCampaign>(
      `SELECT k.id::text AS id, k.code, k.name, k.status,
              coalesce((SELECT json_agg(json_build_object('number', s.position, 'channel', s.channel, 'day', s.day_number, 'title', s.title) ORDER BY s.position)
                          FROM campaign_steps s WHERE s.campaign_id = k.id), '[]'::json) AS steps
         FROM campaigns k ORDER BY k.id DESC LIMIT 100`,
    ),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6 lg:p-8">
      <AiHeader description="The instructions the AI is given for each kind of email. Short codes pull in the knowledge, rules, campaign and company details." />

      <div className="flex items-start justify-between gap-4">
        <p className="max-w-3xl text-sm text-zinc-600">
          Words in double braces, such as <span className="font-mono text-xs">{"{{knowledge}}"}</span>, are short codes. The CRM fills them in before the prompt is sent. Single braces, such as <span className="font-mono text-xs">{"{first_name}"}</span>, are
          placeholders the AI writes into a baseline email. The CRM adds the reply format and the &quot;use only the facts given&quot; rule after your text.
        </p>
        <Link href="/settings/ai/history?kind=prompt" className="shrink-0 text-sm text-sky-700 hover:underline">
          History
        </Link>
      </div>

      <PromptsWorkspace entries={entries} campaigns={campaigns} />
    </div>
  );
}

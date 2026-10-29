import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { fetchVersions, type Kind, type VersionRow } from "@/lib/ai/content";
import { KNOWLEDGE_TOPICS } from "@/lib/ai/knowledge-format";
import { promptTitle } from "@/lib/ai/prompts-format";
import { AiHeader } from "../ai-header";
import { RestoreButton } from "./restore-button";

export const dynamic = "force-dynamic";

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "knowledge", label: "Knowledge" },
  { kind: "rules", label: "Writing rules" },
  { kind: "prompt", label: "Prompts" },
];

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
const clip = (s: unknown, n: number) => {
  const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

function describe(v: VersionRow): { title: string; detail: string } {
  const s = v.snapshot;
  if (v.kind === "knowledge") {
    const title = KNOWLEDGE_TOPICS.find((t) => t.key === v.ref)?.title ?? v.ref.replace(/^service:/, "Service: ");
    return { title, detail: clip(s.body, 160) || "(empty)" };
  }
  if (v.kind === "prompt") return { title: promptTitle(v.ref), detail: clip(s.body, 160) };
  const d = (s.data ?? {}) as { text?: unknown };
  return typeof d.text === "string" ? { title: "Writing rules", detail: clip(d.text, 160) } : { title: "Writing rules (earlier format)", detail: "Saved as separate fields. Restoring it converts it to text." };
}

// Settings -> AI -> History. Admin only: every saved change, with the option to put an older one back.
export default async function AiHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const raw = (await searchParams).kind;
  const kind = (KINDS.find((k) => k.kind === (Array.isArray(raw) ? raw[0] : raw))?.kind ?? "knowledge") as Kind;
  const versions = await fetchVersions(kind);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-8">
      <AiHeader description="Every change to the knowledge, rules and prompts is kept here. Restoring puts an older version back and is itself saved." />

      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Link key={k.kind} href={`/settings/ai/history?kind=${k.kind}`} className={`rounded-xl px-4 py-2 text-sm font-medium ${k.kind === kind ? "bg-zinc-900 text-white" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
            {k.label}
          </Link>
        ))}
      </div>

      {versions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">No changes yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          {versions.map((v) => {
            const d = describe(v);
            return (
              <li key={v.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-800">{d.title}</p>
                  <p className="truncate text-sm text-zinc-500">{d.detail}</p>
                  <p className="text-xs text-zinc-400">
                    {when(v.created_at)} · {v.user_name ?? "Starting text"}
                  </p>
                </div>
                {v.is_current ? <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">Current</span> : <RestoreButton id={v.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

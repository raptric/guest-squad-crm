"use client";

import { useCallback, useRef, useState } from "react";
import type { PromptEntry } from "@/lib/ai/content";
import { PROMPTS } from "@/lib/ai/prompts-format";
import { CodePanel } from "./code-panel";
import { PromptCard } from "./prompt-card";

export type PreviewStep = { number: number; channel: string; day: number; title: string };
export type PreviewCampaign = { id: string; code: string; name: string; status: string; steps: PreviewStep[] };

const GROUPS = [
  { group: "campaign" as const, title: "Campaign emails", hint: "Used while building a campaign. They write the reusable baseline for a step, with placeholders such as {first_name}." },
  { group: "company" as const, title: "Company emails", hint: "Used on a company's task. They adapt the baseline for that one company, using what the CRM knows about it." },
];

// The four prompts on the left, the short codes on the right. Clicking a code puts it where the cursor was in the prompt
// being edited.
export function PromptsWorkspace({ entries, campaigns }: { entries: PromptEntry[]; campaigns: PreviewCampaign[] }) {
  const inserters = useRef(new Map<string, (tag: string) => void>());
  const [active, setActive] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const register = useCallback((key: string, fn: (tag: string) => void) => {
    inserters.current.set(key, fn);
    return () => {
      inserters.current.delete(key);
    };
  }, []);

  function insert(tag: string) {
    const fn = active ? inserters.current.get(active) : undefined;
    if (!fn) {
      setHint("Click inside a prompt first, then click a code to put it there.");
      return;
    }
    setHint(null);
    fn(tag);
  }

  const activeTitle = PROMPTS.find((p) => p.key === active)?.title ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 space-y-8">
        {GROUPS.map((g) => (
          <section key={g.group} className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">{g.title}</h2>
              <p className="text-sm text-zinc-500">{g.hint}</p>
            </div>
            {PROMPTS.filter((p) => p.group === g.group).map((p) => (
              <PromptCard
                key={p.key}
                def={{ key: p.key, group: p.group, title: p.title, when: p.when, defaultBody: p.defaultBody }}
                entry={entries.find((e) => e.key === p.key)!}
                campaigns={campaigns}
                register={register}
                onFocus={() => {
                  setActive(p.key);
                  setHint(null);
                }}
              />
            ))}
          </section>
        ))}
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <CodePanel onInsert={insert} activeTitle={activeTitle} hint={hint} />
      </aside>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings/ai", label: "Providers & usage" },
  { href: "/settings/ai/knowledge", label: "Knowledge" },
  { href: "/settings/ai/rules", label: "Writing rules" },
  { href: "/settings/ai/prompts", label: "Prompts" },
];

// Title and the tab row shown at the top of every Settings -> AI page.
export function AiHeader({ description }: { description: string }) {
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">AI</h1>
        <p className="text-sm text-zinc-500">{description}</p>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((t) => {
          const active = t.href === "/settings/ai" ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <Link key={t.href} href={t.href} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${active ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

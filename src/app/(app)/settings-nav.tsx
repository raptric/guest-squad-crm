"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const SETTINGS_PAGES: { href: string; label: string }[] = [
  { href: "/settings/pipeline", label: "Pipeline" },
  { href: "/settings/rules", label: "Rules" },
  { href: "/settings/lists", label: "Lists" },
  { href: "/settings/connections", label: "Connections" },
  { href: "/settings/ai", label: "AI" },
];

// The Settings entry in the sidebar. It opens to show its pages while any Settings page is open.
export function SettingsNav({ icon }: { icon: React.ReactNode }) {
  const pathname = usePathname();
  const open = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <div className="flex flex-col gap-1">
      <Link
        href="/settings/pipeline"
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${open ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100"}`}
      >
        {icon}
        <span className="flex-1">Settings</span>
      </Link>
      {open && (
        <div className="ml-5 flex flex-col gap-0.5 border-l border-zinc-200 pl-2">
          {SETTINGS_PAGES.map((p) => {
            const active = pathname === p.href || pathname.startsWith(`${p.href}/`);
            return (
              <Link key={p.href} href={p.href} className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${active ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"}`}>
                {p.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

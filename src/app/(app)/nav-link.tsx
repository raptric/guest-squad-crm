"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, icon, badge, badgeTitle, children }: { href: string; icon?: React.ReactNode; badge?: number; badgeTitle?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        isActive ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {badge ? (
        <span
          title={badgeTitle ?? "Companies waiting to be assigned"}
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"}`}
        >
          {badge.toLocaleString()}
        </span>
      ) : null}
    </Link>
  );
}

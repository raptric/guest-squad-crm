"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, icon, children }: { href: string; icon?: React.ReactNode; children: React.ReactNode }) {
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
      {children}
    </Link>
  );
}

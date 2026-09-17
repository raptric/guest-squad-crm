"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-2 text-sm font-medium ${
        isActive ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
      }`}
    >
      {children}
    </Link>
  );
}

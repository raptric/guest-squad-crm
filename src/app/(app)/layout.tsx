import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { LogoutButton } from "./logout-button";
import { NavLink } from "./nav-link";
import { BuildingIcon, ChartIcon, ClipboardCheckIcon, CogIcon, GridIcon, UserIcon, UsersIcon } from "./icons";

// Every page under here reads live, frequently-mutated data (companies, contacts, signals,
// users) and gets refreshed via router.refresh() after inline add/edit forms -- without this,
// Next's fetch cache can serve a stale Supabase response for a request URL it's seen before.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col self-start border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-4">
          <Link href="/" className="font-semibold text-zinc-900">
            Guest Squad CRM
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          <NavLink href="/" icon={<GridIcon />}>Dashboard</NavLink>
          <NavLink href="/review" icon={<ClipboardCheckIcon />}>Review Queue</NavLink>
          <NavLink href="/companies" icon={<BuildingIcon />}>Companies</NavLink>
          <NavLink href="/contacts" icon={<UserIcon />}>Contacts</NavLink>
          {user?.role === "super_admin" && <NavLink href="/scraper-monitor" icon={<ChartIcon />}>Scraper Monitor</NavLink>}
          {user?.role === "super_admin" && <NavLink href="/users" icon={<UsersIcon />}>Users</NavLink>}
          {user?.role === "super_admin" && <NavLink href="/settings" icon={<CogIcon />}>Settings</NavLink>}
        </nav>

        <div className="border-t border-zinc-200 p-3">
          <Link href="/profile" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </span>
            <span className="truncate">{user?.name}</span>
          </Link>
          <div className="px-3 pb-1">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}

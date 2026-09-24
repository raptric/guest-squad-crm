import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { LogoutButton } from "./logout-button";
import { NavLink } from "./nav-link";

// Every page under here reads live, frequently-mutated data (companies, contacts, signals,
// users) and gets refreshed via router.refresh() after inline add/edit forms -- without this,
// Next's fetch cache can serve a stale Supabase response for a request URL it's seen before.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1">
      <aside className="flex w-56 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-4 py-4">
          <Link href="/" className="font-semibold text-zinc-900">
            Guest Squad CRM
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          <NavLink href="/">Dashboard</NavLink>
          <NavLink href="/review">Review Queue</NavLink>
          <NavLink href="/companies">Companies</NavLink>
          <NavLink href="/contacts">Contacts</NavLink>
          {user?.role === "super_admin" && <NavLink href="/users">Users</NavLink>}
          {user?.role === "super_admin" && <NavLink href="/settings">Settings</NavLink>}
        </nav>

        <div className="border-t border-zinc-200 p-3">
          <Link href="/profile" className="block rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100">
            {user?.name}
          </Link>
          <div className="px-3 pb-1">
            <LogoutButton />
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}

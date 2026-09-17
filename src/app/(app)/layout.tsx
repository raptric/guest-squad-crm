import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { LogoutButton } from "./logout-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <nav className="flex items-center gap-4 text-sm font-medium text-zinc-700">
          <Link href="/" className="font-semibold text-zinc-900">
            Guest Squad CRM
          </Link>
          <Link href="/">Home</Link>
          {user?.role === "super_admin" && <Link href="/users">Users</Link>}
          <Link href="/profile">Profile</Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">{user?.name}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}

import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm space-y-2 rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Welcome, {user?.name}</h1>
        <p className="text-sm text-zinc-600">Role: {user?.role}</p>
      </div>
    </div>
  );
}

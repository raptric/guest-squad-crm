"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Filter the task list by campaign.
export function CampaignFilter({ campaigns }: { campaigns: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  return (
    <select
      value={sp.get("campaign") ?? ""}
      onChange={(e) => {
        const p = new URLSearchParams(sp.toString());
        if (e.target.value) p.set("campaign", e.target.value);
        else p.delete("campaign");
        router.replace(`${pathname}?${p.toString()}`);
      }}
      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-sky-500 focus:outline-none"
    >
      <option value="">All campaigns</option>
      {campaigns.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

import Link from "next/link";

// Details | Enrollments | Companies that fit -- shown at the top of every page of a campaign.
export function CampaignTabs({ id, active }: { id: string; active: "details" | "enrollments" | "fit" }) {
  const tabs: { key: typeof active; label: string; href: string }[] = [
    { key: "details", label: "Details", href: `/campaigns/${id}` },
    { key: "enrollments", label: "Enrollments", href: `/campaigns/${id}/enrollments` },
    { key: "fit", label: "Companies that fit", href: `/campaigns/${id}/fit` },
  ];
  return (
    <nav className="flex gap-1 border-b border-zinc-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${active === t.key ? "border-zinc-900 text-zinc-900" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

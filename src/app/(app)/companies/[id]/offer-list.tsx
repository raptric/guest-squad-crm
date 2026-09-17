"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Offer = {
  id: number;
  service: string;
  type: string;
  rationale: string | null;
};

export function OfferList({ companyId, offers }: { companyId: number; offers: Offer[] }) {
  const router = useRouter();
  const [removingId, setRemovingId] = useState<number | null>(null);

  async function handleRemove(offerId: number) {
    setRemovingId(offerId);
    await fetch(`/api/companies/${companyId}/offers/${offerId}`, { method: "DELETE" });
    setRemovingId(null);
    router.refresh();
  }

  const primary = offers.find((o) => o.type === "Primary");
  const secondary = offers.filter((o) => o.type === "Secondary");

  return (
    <div className="space-y-3">
      {primary && <OfferCard offer={primary} onRemove={handleRemove} removing={removingId === primary.id} />}
      {secondary.map((o) => (
        <OfferCard key={o.id} offer={o} onRemove={handleRemove} removing={removingId === o.id} />
      ))}
    </div>
  );
}

function OfferCard({
  offer,
  onRemove,
  removing,
}: {
  offer: Offer;
  onRemove: (id: number) => void;
  removing: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-100 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
              offer.type === "Primary" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"
            }`}
          >
            {offer.type}
          </span>
          <span className="text-sm font-medium text-zinc-900">{offer.service}</span>
        </div>
        <button
          onClick={() => onRemove(offer.id)}
          disabled={removing}
          className="text-xs text-zinc-400 hover:text-red-600 disabled:opacity-50"
        >
          {removing ? "Removing..." : "Remove"}
        </button>
      </div>
      {offer.rationale && <p className="mt-1 text-sm text-zinc-600">{offer.rationale}</p>}
    </div>
  );
}

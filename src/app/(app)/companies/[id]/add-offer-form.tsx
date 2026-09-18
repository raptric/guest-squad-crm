import { OFFER_TYPES } from "@/lib/companies/constants";
import { getPicklistValues } from "@/lib/picklists";
import { InlineAddForm } from "./inline-add-form";

export async function AddOfferForm({ companyId }: { companyId: number }) {
  const offerServices = await getPicklistValues("offer_service");

  return (
    <InlineAddForm
      buttonLabel="Add Recommendation"
      submitLabel="Save Recommendation"
      endpoint={`/api/companies/${companyId}/offers`}
    >
      <div className="grid grid-cols-2 gap-3">
        <select name="service" required defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="" disabled>Service</option>
          {offerServices.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="type" required defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="" disabled>Type</option>
          {OFFER_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <textarea
        name="rationale"
        rows={2}
        placeholder="Why this offer fits (signals, ratings, pain points it addresses)..."
        className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
      />
      <p className="text-xs text-zinc-500">Only one Primary recommendation is allowed per company.</p>
    </InlineAddForm>
  );
}

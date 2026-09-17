import { RATING_CHANNELS } from "@/lib/companies/constants";
import { InlineAddForm } from "./inline-add-form";

export function AddRatingForm({ companyId }: { companyId: number }) {
  return (
    <InlineAddForm
      buttonLabel="Add / Update Rating"
      submitLabel="Save Rating"
      endpoint={`/api/companies/${companyId}/ratings`}
    >
      <div className="grid grid-cols-3 gap-3">
        <select name="channel" required defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="" disabled>Channel</option>
          {RATING_CHANNELS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input name="rating" type="number" step="0.1" min="0" placeholder="Rating (e.g. 4.5)" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
        <input name="review_count" type="number" min="0" placeholder="Review count" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <p className="text-xs text-zinc-500">Saving again for the same channel updates the existing rating.</p>
    </InlineAddForm>
  );
}

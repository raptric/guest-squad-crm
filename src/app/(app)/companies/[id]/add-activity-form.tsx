import { MANUAL_ACTIVITY_TYPES } from "@/lib/companies/constants";
import { InlineAddForm } from "./inline-add-form";

export function AddActivityForm({ companyId }: { companyId: number }) {
  return (
    <InlineAddForm
      buttonLabel="Log Activity"
      submitLabel="Save Activity"
      endpoint={`/api/companies/${companyId}/activities`}
    >
      <select name="activity_type" required defaultValue="" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
        <option value="" disabled>Type</option>
        {MANUAL_ACTIVITY_TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <textarea name="body" rows={3} placeholder="What happened?" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
    </InlineAddForm>
  );
}

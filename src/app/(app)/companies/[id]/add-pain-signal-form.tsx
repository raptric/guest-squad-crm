import { PAIN_SIGNAL_TYPES } from "@/lib/companies/constants";
import { InlineAddForm } from "./inline-add-form";

export function AddPainSignalForm({ companyId }: { companyId: number }) {
  return (
    <InlineAddForm
      buttonLabel="Add Pain Signal"
      submitLabel="Save Signal"
      endpoint={`/api/companies/${companyId}/pain-signals`}
    >
      <div className="grid grid-cols-2 gap-3">
        <select name="pain_type" required defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="" disabled>Pain type</option>
          {PAIN_SIGNAL_TYPES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <input name="source_url" placeholder="Source URL" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
    </InlineAddForm>
  );
}

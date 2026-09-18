import { COMPANY_SIGNAL_TYPES } from "@/lib/companies/constants";
import { getPicklistValues } from "@/lib/picklists";
import { InlineAddForm } from "./inline-add-form";

export async function AddSignalForm({ companyId }: { companyId: number }) {
  const strengthLevels = await getPicklistValues("strength");

  return (
    <InlineAddForm
      buttonLabel="Add Sales Signal"
      submitLabel="Save Signal"
      endpoint={`/api/companies/${companyId}/signals`}
    >
      <div className="grid grid-cols-2 gap-3">
        <select name="signal_type" required defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="" disabled>Signal type</option>
          {COMPANY_SIGNAL_TYPES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="strength" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">Strength —</option>
          {strengthLevels.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <input name="source_url" placeholder="Source URL" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
    </InlineAddForm>
  );
}

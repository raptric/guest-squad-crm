import { HIRING_SIGNAL_ROLES, STRENGTH_LEVELS } from "@/lib/companies/constants";
import { InlineAddForm } from "./inline-add-form";

export function AddHiringSignalForm({ companyId }: { companyId: number }) {
  return (
    <InlineAddForm
      buttonLabel="Add Hiring Signal"
      submitLabel="Save Signal"
      endpoint={`/api/companies/${companyId}/hiring-signals`}
    >
      <div className="grid grid-cols-2 gap-3">
        <select name="role" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">Role —</option>
          {HIRING_SIGNAL_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select name="strength" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">Strength —</option>
          {STRENGTH_LEVELS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <input name="job_title" placeholder="Job title (e.g. Overnight Front Desk Agent)" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      <input name="source_url" placeholder="Job posting URL" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
    </InlineAddForm>
  );
}

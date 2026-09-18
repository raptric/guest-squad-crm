import { getPicklistValues } from "@/lib/picklists";
import { InlineAddForm } from "./inline-add-form";

export async function AddContactForm({ companyId }: { companyId: number }) {
  const [contactRoles, decisionMakerLevels, contactLineTypes] = await Promise.all([
    getPicklistValues("contact_role"),
    getPicklistValues("decision_maker_level"),
    getPicklistValues("contact_line_type"),
  ]);

  return (
    <InlineAddForm
      buttonLabel="Add Contact"
      submitLabel="Save Contact"
      endpoint={`/api/companies/${companyId}/contacts`}
    >
      <div className="grid grid-cols-2 gap-3">
        <input name="first_name" placeholder="First name" required className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
        <input name="last_name" placeholder="Last name" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input name="email" type="email" placeholder="Email" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
        <input name="phone" placeholder="Phone" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      </div>
      <input name="job_title" placeholder="Job title" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
      <div className="grid grid-cols-3 gap-3">
        <select name="contact_role" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">Role —</option>
          {contactRoles.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select name="decision_maker_level" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">Decision Maker —</option>
          {decisionMakerLevels.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select name="contact_line_type" defaultValue="" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
          <option value="">Line Type —</option>
          {contactLineTypes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <input name="linkedin_url" placeholder="LinkedIn URL" className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
    </InlineAddForm>
  );
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHumanActor } from "@/app/api/contacts/actor";
import { createContact } from "@/app/api/contacts/create";

// Quick-add from a company page: a flat form (one email, one phone) becomes a contact linked
// to this company. If the email already belongs to someone, that person is linked instead.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const actor = await getHumanActor(supabase);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await request.json();
  const companyId = Number(id);
  return createContact(
    supabase,
    {
      first_name: b.first_name,
      last_name: b.last_name,
      linkedin_url: b.linkedin_url,
      contact_line_type: b.contact_line_type,
      companies: [
        { company_id: companyId, job_title: b.job_title, contact_role: b.contact_role, decision_maker_level: b.decision_maker_level },
      ],
      emails: b.email ? [{ email: b.email, label: "Work", company_id: companyId }] : [],
      phones: b.phone ? [{ phone: b.phone, label: "Work", company_id: companyId }] : [],
    },
    actor,
    { linkExisting: true }
  );
}

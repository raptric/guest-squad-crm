import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPicklistValues } from "@/lib/picklists";
import { getCurrentUser } from "@/lib/current-user";
import { assignOwner } from "@/lib/assignment";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Text columns (max = column length). Blank clears the value, except where required.
const TEXT: Record<string, { max: number; required?: boolean }> = {
  name: { max: 255, required: true },
  website: { max: 255 },
  phone: { max: 50 },
  address_line_1: { max: 255 },
  address_line_2: { max: 255 },
  city: { max: 120 },
  state: { max: 120 },
  zip: { max: 20 },
};
// Dropdown columns -> the picklist their value must come from.
const COMPANY_PICKLIST: Record<string, string> = { country: "country", prospect_tier: "prospect_tier" };
const PROPERTY_PICKLIST: Record<string, string> = {
  property_type: "property_type",
  property_class: "property_class",
  portfolio_role: "portfolio_role",
};

// Inline edit from the company page: saves ONE field of the company or of its property profile.
//   { target: "company" | "property", field, value }
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return fail("Invalid company id");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Unauthorized", 401);

  const { target, field, value } = (await request.json()) as { target?: string; field?: string; value?: unknown };
  if ((target !== "company" && target !== "property") || typeof field !== "string") return fail("target and field are required");
  const raw = value === null || value === undefined ? "" : String(value).trim();

  // Owner goes through the assignment rules (and moves the company into the new owner's team).
  if (target === "company" && field === "owner_id") {
    if (raw && !/^\d+$/.test(raw)) return fail("Invalid owner");
    const actor = await getCurrentUser();
    const result = actor ? await assignOwner(actor, Number(id), raw ? Number(raw) : null) : { error: "Unauthorized" };
    if ("error" in result) return fail(result.error, 403);
    return NextResponse.json({ value: raw ? Number(raw) : null });
  }

  const table = target === "company" ? "companies" : "property_details";
  const keyColumn = target === "company" ? "id" : "company_id";

  // Current stored value: a legacy value no longer in a picklist may be re-saved unchanged.
  const readCurrent = async () => {
    const { data } = await supabase.from(table).select(field).eq(keyColumn, id).maybeSingle();
    return (data as unknown as Record<string, unknown> | null)?.[field] ?? null;
  };

  let parsed: string | number | null;

  if (target === "company" && field in TEXT) {
    const rule = TEXT[field];
    if (!raw && rule.required) return fail(`${field} can't be empty`);
    if (raw.length > rule.max) return fail(`${field} must be ${rule.max} characters or fewer`);
    parsed = raw || null;
  } else if (target === "company" && field === "email") {
    if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return fail("That doesn't look like an email address");
    if (raw.length > 255) return fail("email must be 255 characters or fewer");
    parsed = raw.toLowerCase() || null;
  } else if (
    (target === "company" && field in COMPANY_PICKLIST) ||
    (target === "property" && field in PROPERTY_PICKLIST)
  ) {
    const list = (target === "company" ? COMPANY_PICKLIST : PROPERTY_PICKLIST)[field];
    if (raw) {
      const allowed = await fetchPicklistValues(supabase, list);
      if (!allowed.includes(raw) && (await readCurrent()) !== raw) return fail(`${raw} isn't a valid ${field.replace("_", " ")}`);
    }
    parsed = raw || null;
  } else if (target === "property" && field === "rooms_units") {
    if (raw && !/^\d{1,6}$/.test(raw)) return fail("Rooms/units must be a whole number");
    parsed = raw ? Number(raw) : null;
  } else {
    return fail(`${field} can't be edited inline`);
  }

  const { data, error } = await supabase
    .from(table)
    .update({ [field]: parsed })
    .eq(keyColumn, id)
    .select(field)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail(target === "property" ? "This company has no property profile" : "Company not found", 404);

  return NextResponse.json({ value: (data as unknown as Record<string, unknown>)[field] });
}

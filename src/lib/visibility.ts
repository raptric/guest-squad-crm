import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { leadScopeSql, type Actor } from "@/lib/assignment";

// Who sees which companies:
//   * Admin: every company (including ones nobody has been given yet)
//   * Team Lead: companies assigned to their team, or owned by someone in their team
//   * User: only the companies they own
// Everything that lists, counts, opens or changes a company goes through this file.

// SQL condition limiting a query to the companies `actor` may see. `alias` is the companies table alias in the query;
// `add` pushes a value into the query's parameter list and returns its placeholder.
export function visibleSql(actor: Actor | null | undefined, alias: string, add: (v: unknown) => string): string {
  if (!actor) return "false";
  if (actor.role === "super_admin") return "true";
  if (actor.role === "team_lead" && actor.team_id !== null && actor.team_id !== undefined) {
    return leadScopeSql(add(actor.team_id)).replace(/\bc\./g, `${alias}.`);
  }
  if (actor.role === "user") return `${alias}.owner_id = ${add(actor.id)}::bigint`;
  return "false";
}

// Can this person see (and so open or change) this company?
export async function canViewCompany(actor: Actor | null | undefined, companyId: number | string): Promise<boolean> {
  if (!actor) return false;
  const id = Number(companyId);
  if (!Number.isInteger(id)) return false;
  const params: unknown[] = [id];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const rows = await query<{ ok: boolean }>(`SELECT true AS ok FROM companies c WHERE c.id = $1 AND ${visibleSql(actor, "c", add)}`, params);
  return rows.length > 0;
}

// For API routes: null when the signed-in person may use this company, otherwise the response to send back.
// A company outside someone's view looks exactly like one that doesn't exist.
export async function companyAccessError(companyId: number | string): Promise<NextResponse | null> {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canViewCompany(actor, companyId))) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  return null;
}

// ----- contacts -----
// A contact is visible when it is linked to at least one company the person may see (admins see every contact).
export function contactVisibleSql(actor: Actor | null | undefined, alias: string, add: (v: unknown) => string): string {
  if (!actor) return "false";
  if (actor.role === "super_admin") return "true";
  return `EXISTS (SELECT 1 FROM contact_companies vcc JOIN companies c ON c.id = vcc.company_id AND c.deleted_at IS NULL
                   WHERE vcc.contact_id = ${alias}.id AND ${visibleSql(actor, "c", add)})`;
}

export async function canViewContact(actor: Actor | null | undefined, contactId: number | string): Promise<boolean> {
  if (!actor) return false;
  const id = Number(contactId);
  if (!Number.isInteger(id)) return false;
  const params: unknown[] = [id];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const rows = await query<{ ok: boolean }>(
    `SELECT true AS ok FROM contacts k WHERE k.id = $1 AND k.deleted_at IS NULL AND ${contactVisibleSql(actor, "k", add)}`,
    params
  );
  return rows.length > 0;
}

export async function contactAccessError(contactId: number | string): Promise<NextResponse | null> {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canViewContact(actor, contactId))) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  return null;
}

// Of these company ids, the ones that don't exist or that the signed-in person may not see.
export async function unavailableCompanyIds(companyIds: number[]): Promise<number[]> {
  if (companyIds.length === 0) return [];
  const actor = await getCurrentUser();
  const params: unknown[] = [companyIds];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const rows = await query<{ id: string }>(
    `SELECT c.id FROM companies c WHERE c.id = ANY($1::bigint[]) AND c.deleted_at IS NULL AND ${visibleSql(actor, "c", add)}`,
    params
  );
  const found = new Set(rows.map((r) => Number(r.id)));
  return companyIds.filter((id) => !found.has(id));
}

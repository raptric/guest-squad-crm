import { query, withTransaction } from "@/lib/db";
import { leadScopeSql, type Actor } from "@/lib/assignment";
import { progressOf, reasonsFor, suggestKeep, type DupCompany, type DupGroup } from "@/lib/duplicates-format";

// Duplicates, phase 1. A "copy" is a company with the same name (ignoring capitals and extra spaces) AND the same phone
// number (last 10 digits) or the same street address and city. Website alone is never used: chain hotels share domains.
// Admins see every company; team leads only the companies in their team.

const NAME_SQL = String.raw`regexp_replace(lower(trim(c.name)), '\s+', ' ', 'g')`;
const DIGITS_SQL = String.raw`regexp_replace(coalesce(c.phone, ''), '\D', '', 'g')`;
const PHONE_SQL = `CASE WHEN length(${DIGITS_SQL}) >= 7 THEN right(${DIGITS_SQL}, 10) END`;
const ADDRESS_SQL = String.raw`CASE WHEN trim(coalesce(c.address_line_1, '')) <> '' THEN regexp_replace(lower(trim(c.address_line_1 || ' ' || coalesce(c.city, ''))), '\s+', ' ', 'g') END`;

const scopeSql = (actor: Actor) => (actor.role === "super_admin" ? { sql: "", params: [] as unknown[] } : { sql: ` AND ${leadScopeSql("$1")}`, params: [actor.team_id] as unknown[] });

// ---- scan ----------------------------------------------------------------------------------------------------------

type Slim = { id: string; nm: string; ph: string | null; ad: string | null };

export async function scanDuplicates(actor: Actor): Promise<{ groups: DupGroup[]; scanned: number; copies: number }> {
  const scope = scopeSql(actor);
  const rows = await query<Slim>(
    `SELECT c.id::text AS id, ${NAME_SQL} AS nm, ${PHONE_SQL} AS ph, ${ADDRESS_SQL} AS ad
       FROM companies c WHERE c.deleted_at IS NULL AND trim(c.name) <> ''${scope.sql}`,
    scope.params
  );

  // Within each name, join copies that share a phone or an address (union-find), remembering what linked them.
  const byName = new Map<string, Slim[]>();
  for (const r of rows) byName.set(r.nm, [...(byName.get(r.nm) ?? []), r]);

  const raw: { ids: string[]; phone: boolean; address: boolean }[] = [];
  for (const members of byName.values()) {
    if (members.length < 2) continue;
    const parent = members.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const links: { a: number; b: number; phone: boolean; address: boolean }[] = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const phone = !!members[i].ph && members[i].ph === members[j].ph;
        const address = !!members[i].ad && members[i].ad === members[j].ad;
        if (phone || address) {
          links.push({ a: i, b: j, phone, address });
          parent[find(i)] = find(j);
        }
      }
    }
    const comps = new Map<number, { ids: string[]; phone: boolean; address: boolean }>();
    members.forEach((m, i) => {
      const root = find(i);
      const comp = comps.get(root) ?? { ids: [], phone: false, address: false };
      comp.ids.push(m.id);
      comps.set(root, comp);
    });
    for (const l of links) {
      const comp = comps.get(find(l.a))!;
      comp.phone ||= l.phone;
      comp.address ||= l.address;
    }
    for (const comp of comps.values()) if (comp.ids.length >= 2) raw.push(comp);
  }

  // Groups someone marked "not duplicates" stay hidden, unless a new copy has joined since.
  const dismissed = await query<{ company_ids: string[] }>("SELECT company_ids::text[] AS company_ids FROM duplicate_dismissals");
  const visible = raw.filter((g) => !dismissed.some((d) => g.ids.every((id) => d.company_ids.includes(id))));
  if (visible.length === 0) return { groups: [], scanned: rows.length, copies: 0 };

  const details = await fetchDetails(visible.flatMap((g) => g.ids));
  const groups: DupGroup[] = visible
    .map((g) => {
      const companies = g.ids.map((id) => details.get(id)).filter((c): c is DupCompany => !!c);
      const keep = suggestKeep(companies);
      return {
        key: [...g.ids].sort((a, b) => Number(a) - Number(b)).join("-"),
        match: g.phone && g.address ? "same name, phone and address" : g.phone ? "same name and phone" : "same name and address",
        companies: companies.sort((a, b) => Number(a.id) - Number(b.id)),
        suggested_id: keep.id,
        reasons: reasonsFor(keep),
      };
    })
    .filter((g) => g.companies.length >= 2)
    .sort((a, b) => b.companies.length - a.companies.length || a.companies[0].name.localeCompare(b.companies[0].name));

  return { groups, scanned: rows.length, copies: groups.reduce((n, g) => n + g.companies.length, 0) };
}

type DetailRow = {
  id: string; name: string; address_line_1: string | null; city: string | null; state: string | null; phone: string | null; website: string | null; email: string | null;
  source: string | null; campaign_name: string | null; created_at: Date; verification_status: string | null; owner_name: string | null; team_name: string | null;
  status_name: string | null; status_color: string | null; stage_name: string | null; stage_order: number | null; parent_name: string | null;
  parent_company_id: string | null; portfolio_role: string | null; property_type: string | null; rooms_units: number | null;
  contacts: number; ratings: number; signals: number; hiring: number; offers: number; active_enrollments: number; children: number;
};

async function fetchDetails(ids: string[]): Promise<Map<string, DupCompany>> {
  const rows = await query<DetailRow>(
    `SELECT c.id::text AS id, c.name, c.address_line_1, c.city, c.state, c.phone, c.website, c.email, c.source, b.campaign_name, c.created_at,
            c.verification_status, o.name AS owner_name, t.name AS team_name,
            ps.name AS status_name, ps.color AS status_color, pst.name AS stage_name, pst.sort_order AS stage_order,
            par.name AS parent_name, c.parent_company_id::text AS parent_company_id, pd.portfolio_role, pd.property_type, pd.rooms_units,
            (SELECT count(*)::int FROM contact_companies cc JOIN contacts ct ON ct.id = cc.contact_id AND ct.deleted_at IS NULL WHERE cc.company_id = c.id) AS contacts,
            (SELECT count(*)::int FROM company_ratings WHERE company_id = c.id) AS ratings,
            (SELECT count(*)::int FROM company_signals WHERE company_id = c.id) AS signals,
            (SELECT count(*)::int FROM company_hiring_signals WHERE company_id = c.id) AS hiring,
            (SELECT count(*)::int FROM offer_recommendations WHERE company_id = c.id) AS offers,
            (SELECT count(*)::int FROM campaign_enrollments WHERE company_id = c.id AND status = 'active') AS active_enrollments,
            (SELECT count(*)::int FROM companies ch WHERE ch.parent_company_id = c.id AND ch.deleted_at IS NULL) AS children
       FROM companies c
       LEFT JOIN users o ON o.id = c.owner_id
       LEFT JOIN teams t ON t.id = c.team_id
       LEFT JOIN pipeline_statuses ps ON ps.id = c.pipeline_status_id
       LEFT JOIN pipeline_stages pst ON pst.id = c.pipeline_stage_id
       LEFT JOIN companies par ON par.id = c.parent_company_id
       LEFT JOIN property_details pd ON pd.company_id = c.id
       LEFT JOIN import_batches b ON b.id = c.import_batch_id
      WHERE c.id = ANY($1::bigint[])`,
    [ids]
  );
  const map = new Map<string, DupCompany>();
  for (const r of rows) {
    const richness =
      [r.website, r.phone, r.email, r.address_line_1, r.state].filter(Boolean).length +
      (r.ratings > 0 ? 1 : 0) + (r.signals > 0 ? 1 : 0) + (r.hiring > 0 ? 1 : 0) + (r.offers > 0 ? 1 : 0) + (r.property_type ? 1 : 0) + (r.rooms_units ? 1 : 0);
    map.set(r.id, {
      id: r.id,
      name: r.name,
      // Scraped addresses often already end with the city and state, so only add them when they aren't there.
      address:
        r.address_line_1 && r.city && r.address_line_1.toLowerCase().includes(r.city.toLowerCase())
          ? r.address_line_1
          : [r.address_line_1, r.city, r.state].filter(Boolean).join(", ") || null,
      city: r.city,
      state: r.state,
      phone: r.phone,
      website: r.website,
      email: r.email,
      source: r.source,
      campaign_name: r.campaign_name,
      created_at: new Date(r.created_at).toISOString(),
      verified: r.verification_status === "Ready for Outreach",
      owner_name: r.owner_name,
      team_name: r.team_name,
      status_name: r.status_name,
      status_color: r.status_color,
      stage_name: r.stage_name,
      progress: progressOf(r.status_name, r.stage_order),
      parent_name: r.parent_name,
      portfolio: r.parent_company_id !== null || (r.portfolio_role !== null && r.portfolio_role !== "Independent"),
      contacts: r.contacts,
      ratings: r.ratings,
      signals: r.signals,
      offers: r.offers,
      richness,
      active_enrollments: r.active_enrollments,
      children: r.children,
    });
  }
  return map;
}

// ---- actions -------------------------------------------------------------------------------------------------------

type Failure = { error: string; status: number };
const ok = { ok: true as const };

// Keep one copy, delete (soft) the others. Re-checks everything on the server: same name, in the actor's scope, not in an
// active campaign, not the parent of other properties.
export async function deleteDuplicates(actor: Actor & { name: string }, keepId: number, deleteIds: number[]): Promise<Failure | { ok: true; deletion_id: number; deleted: number }> {
  const ids = [...new Set(deleteIds)];
  if (ids.length === 0 || ids.length > 25) return { error: "Choose between 1 and 25 copies to delete.", status: 400 };
  if (ids.includes(keepId)) return { error: "The copy you keep can't also be deleted.", status: 400 };

  return withTransaction(async (client) => {
    const all = [keepId, ...ids];
    const scope = actor.role === "super_admin" ? "true" : leadScopeSql("$2");
    const rows = (
      await client.query(
        `SELECT c.id::text AS id, c.name, ${NAME_SQL} AS nm, (${scope}) AS in_scope,
                (SELECT count(*)::int FROM campaign_enrollments e WHERE e.company_id = c.id AND e.status = 'active') AS active_enrollments,
                (SELECT count(*)::int FROM companies ch WHERE ch.parent_company_id = c.id AND ch.deleted_at IS NULL) AS children
           FROM companies c WHERE c.id = ANY($1::bigint[]) AND c.deleted_at IS NULL FOR UPDATE OF c`,
        actor.role === "super_admin" ? [all] : [all, actor.team_id]
      )
    ).rows;
    if (rows.length !== all.length) return { error: "One of these companies no longer exists or was already deleted. Run the check again.", status: 409 };
    if (rows.some((r) => !r.in_scope)) return { error: "You can only change companies in your team.", status: 403 };
    if (new Set(rows.map((r) => r.nm)).size !== 1) return { error: "These companies don't have the same name, so they aren't duplicates.", status: 400 };
    const blocked = rows.find((r) => ids.includes(Number(r.id)) && (r.active_enrollments > 0 || r.children > 0));
    if (blocked) {
      return { error: `${blocked.name} (#${blocked.id}) can't be deleted: ${blocked.active_enrollments > 0 ? "it is in an active campaign" : "other properties are part of it"}.`, status: 409 };
    }

    await client.query("UPDATE companies SET deleted_at = now() WHERE id = ANY($1::bigint[])", [ids]);
    const deletion = (
      await client.query(
        "INSERT INTO duplicate_deletions (kept_company_id, deleted_company_ids, deleted_by, deleted_by_name) VALUES ($1, $2::bigint[], $3, $4) RETURNING id",
        [keepId, ids, actor.id, actor.name]
      )
    ).rows[0];

    const kept = rows.find((r) => Number(r.id) === keepId)!;
    const removed = rows.filter((r) => ids.includes(Number(r.id)));
    await client.query(
      `INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body) VALUES ($1, 'note', 'human', $2, $3)`,
      [keepId, actor.name, `Duplicate check: kept this company and removed ${removed.length} duplicate cop${removed.length === 1 ? "y" : "ies"} (${removed.map((r) => `#${r.id}`).join(", ")}).`]
    );
    for (const r of removed) {
      await client.query(`INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body) VALUES ($1, 'note', 'human', $2, $3)`, [
        r.id,
        actor.name,
        `Deleted as a duplicate of ${kept.name} (#${kept.id}).`,
      ]);
    }
    return { ok: true as const, deletion_id: Number(deletion.id), deleted: ids.length };
  });
}

export async function dismissGroup(actor: Actor & { name: string }, companyIds: number[]): Promise<Failure | typeof ok> {
  const ids = [...new Set(companyIds)];
  if (ids.length < 2 || ids.length > 50) return { error: "A group needs at least two companies.", status: 400 };
  const scope = scopeSql({ ...actor });
  const found = await query<{ id: string }>(
    `SELECT c.id::text AS id FROM companies c WHERE c.deleted_at IS NULL AND c.id = ANY($${scope.params.length + 1}::bigint[])${scope.sql}`,
    [...scope.params, ids]
  );
  if (found.length !== ids.length) return { error: "Some of these companies are out of your reach or no longer exist. Run the check again.", status: 409 };
  await query("INSERT INTO duplicate_dismissals (company_ids, dismissed_by, dismissed_by_name) VALUES ($1::bigint[], $2, $3)", [ids, actor.id, actor.name]);
  return ok;
}

export async function undoDeletion(actor: Actor & { name: string }, deletionId: number): Promise<Failure | { ok: true; restored: number }> {
  return withTransaction(async (client) => {
    const [deletion] = (await client.query("SELECT id, deleted_company_ids::text[] AS ids, undone_at FROM duplicate_deletions WHERE id = $1 FOR UPDATE", [deletionId])).rows;
    if (!deletion) return { error: "That delete wasn't found.", status: 404 };
    if (deletion.undone_at) return { error: "That delete was already undone.", status: 409 };

    const scope = actor.role === "super_admin" ? "true" : leadScopeSql("$2");
    const rows = (
      await client.query(
        `SELECT c.id::text AS id, (${scope}) AS in_scope FROM companies c WHERE c.id = ANY($1::bigint[]) AND c.deleted_at IS NOT NULL`,
        actor.role === "super_admin" ? [deletion.ids] : [deletion.ids, actor.team_id]
      )
    ).rows;
    if (rows.some((r) => !r.in_scope)) return { error: "You can only restore companies in your team.", status: 403 };
    try {
      await client.query("UPDATE companies SET deleted_at = NULL WHERE id = ANY($1::bigint[])", [rows.map((r) => r.id)]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return { error: "Can't restore: another company now uses the same website.", status: 409 };
      throw e;
    }
    await client.query("UPDATE duplicate_deletions SET undone_at = now(), undone_by_name = $1 WHERE id = $2", [actor.name, deletionId]);
    for (const r of rows) {
      await client.query(`INSERT INTO activities (company_id, activity_type, actor_type, actor_name, body) VALUES ($1, 'note', 'human', $2, 'Restored: the duplicate delete was undone.')`, [r.id, actor.name]);
    }
    return { ok: true as const, restored: rows.length };
  });
}

export type RecentDeletion = { id: string; kept_id: string | null; kept_name: string | null; deleted_by_name: string | null; created_at: Date; names: string[] };

// Deletes that can still be undone, newest first (limited to the viewer's reach for team leads).
export async function recentDeletions(actor: Actor): Promise<RecentDeletion[]> {
  const scope = actor.role === "super_admin" ? "true" : `NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = ANY(d.deleted_company_ids) AND NOT ${leadScopeSql("$1")})`;
  return query<RecentDeletion>(
    `SELECT d.id::text AS id, d.kept_company_id::text AS kept_id, k.name AS kept_name, d.deleted_by_name, d.created_at,
            coalesce((SELECT array_agg(c.name || ' (#' || c.id || ')' ORDER BY c.id) FROM companies c WHERE c.id = ANY(d.deleted_company_ids)), '{}') AS names
       FROM duplicate_deletions d LEFT JOIN companies k ON k.id = d.kept_company_id
      WHERE d.undone_at IS NULL AND ${scope}
      ORDER BY d.created_at DESC LIMIT 10`,
    actor.role === "super_admin" ? [] : [actor.team_id]
  );
}


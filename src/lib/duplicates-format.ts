// Client-safe logic for the Duplicates page (no server imports): the types, which copy to suggest keeping, and what a
// delete would lose. The server uses the same functions, so the suggestion and the warnings always agree.

export type DupCompany = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  source: string | null;
  campaign_name: string | null;
  created_at: string;
  verified: boolean;
  owner_name: string | null;
  team_name: string | null;
  status_name: string | null;
  status_color: string | null;
  stage_name: string | null;
  // How far along the pipeline the company is (higher = further). Used only to suggest which copy to keep.
  progress: number;
  parent_name: string | null;
  portfolio: boolean;
  contacts: number;
  ratings: number;
  signals: number;
  offers: number;
  richness: number;
  // Reasons the company can't be deleted at all.
  active_enrollments: number;
  children: number;
};

export type DupGroup = {
  key: string;
  match: string;
  companies: DupCompany[];
  suggested_id: string;
  reasons: string[];
};

// Known status names ranked by how far a lead has come. A deliberately parked (Nurture) or dropped (Disqualified) company
// ranks above New, so nobody restarts work on a record someone already decided about. Anything an admin adds sits in between.
const BASE: Record<string, number> = { New: 0, Nurture: 1, Disqualified: 1, Qualified: 2, Prospect: 3, Deal: 4, Customer: 5 };
export const progressOf = (statusName: string | null, stageOrder: number | null) => (statusName === null ? 0 : (BASE[statusName] ?? 1.5)) * 1000 + (stageOrder ?? 0);

export const blockerOf = (c: DupCompany): string | null =>
  c.active_enrollments > 0
    ? "It is in an active campaign. Stop the campaign first."
    : c.children > 0
      ? `${c.children} propert${c.children === 1 ? "y is" : "ies are"} part of it. Keep it, or move them first.`
      : null;

// Positive when `a` is the better copy to keep. The order of the checks is the order agreed with the team:
// can't be deleted > verified > further along the pipeline > has an owner > more contacts > part of a portfolio > more data > older.
export function compareKeep(a: DupCompany, b: DupCompany): number {
  const checks: [number, number][] = [
    [blockerOf(a) ? 1 : 0, blockerOf(b) ? 1 : 0],
    [a.verified ? 1 : 0, b.verified ? 1 : 0],
    [a.progress, b.progress],
    [a.owner_name ? 1 : 0, b.owner_name ? 1 : 0],
    [a.contacts, b.contacts],
    [a.portfolio ? 1 : 0, b.portfolio ? 1 : 0],
    [a.richness, b.richness],
  ];
  for (const [x, y] of checks) if (x !== y) return x - y;
  // Older is better (lower id was created first).
  return Number(b.id) - Number(a.id);
}

export const suggestKeep = (companies: DupCompany[]): DupCompany => [...companies].sort((a, b) => compareKeep(b, a))[0];

// Short, human reasons shown next to the suggested copy.
export function reasonsFor(c: DupCompany): string[] {
  const r: string[] = [];
  if (c.active_enrollments > 0) r.push("In an active campaign");
  if (c.children > 0) r.push(`Has ${c.children} propert${c.children === 1 ? "y" : "ies"} under it`);
  if (c.verified) r.push("Verified");
  if (c.status_name) r.push(`${c.status_name}${c.stage_name ? ` / ${c.stage_name}` : ""}`);
  if (c.owner_name) r.push(`Owner: ${c.owner_name}`);
  if (c.contacts > 0) r.push(`${c.contacts} contact${c.contacts === 1 ? "" : "s"}`);
  if (c.portfolio) r.push(c.parent_name ? `Part of ${c.parent_name}` : "Part of a portfolio");
  if (c.richness > 0) r.push(`${c.richness} data point${c.richness === 1 ? "" : "s"}`);
  return r;
}

// What deleting `del` would lose compared with the copy being kept. Empty means nothing of value is lost.
export function lostInfo(keep: DupCompany, del: DupCompany): string[] {
  const lost: string[] = [];
  if (del.verified && !keep.verified) lost.push("it is verified, the kept copy is not");
  if (del.progress > keep.progress) lost.push(`it is further along (${del.status_name ?? "no status"}${del.stage_name ? ` / ${del.stage_name}` : ""})`);
  if (del.owner_name && !keep.owner_name) lost.push(`it has an owner (${del.owner_name})`);
  if (del.contacts > keep.contacts) lost.push(`it has ${del.contacts} contact${del.contacts === 1 ? "" : "s"}, the kept copy has ${keep.contacts}`);
  if (del.portfolio && !keep.portfolio) lost.push(`it is part of a portfolio${del.parent_name ? ` (${del.parent_name})` : ""}, the kept copy is not`);
  if (del.ratings > keep.ratings || del.signals > keep.signals || del.offers > keep.offers) lost.push("it has more research data (ratings, signals or offers)");
  return lost;
}

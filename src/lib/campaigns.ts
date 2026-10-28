import { query } from "@/lib/db";
import { leadScopeSql, type Actor } from "@/lib/assignment";
import { visibleSql } from "@/lib/visibility";
import { CHANNELS, type Visibility } from "@/lib/campaigns-format";
import { audienceSummary, EMPTY_CRITERIA, type Criteria, type Portfolio } from "@/lib/campaign-fit-format";

// Campaigns, phase 1: manual steps and tasks. "Today" is the UTC calendar date for now (per-user time zones come later).
export const READY_FOR_OUTREACH = "Ready for Outreach";
export const TODAY_SQL = "(now() AT TIME ZONE 'UTC')::date";

export type StepInput = { day_number: number; channel: string; title: string; instructions: string };
export type CampaignInput = {
  name: string;
  description: string;
  steps: StepInput[];
  visibility: Visibility;
  team_id: number | null; // admins pick the team for a Team campaign
  owner_id: number | null; // admins can hand a campaign to someone else
  status: "draft" | "active"; // only used when creating
  criteria: Criteria; // the target audience
  outreach_angle: string | null;
  pain_point: string;
  secondary_pains: string[];
  positioning: string;
  differentiators: string[];
  secondary_other: string; // what "Other" means, when picked among the other pain points
  differentiators_other: string; // same for the key differentiators
  call_to_action: string; // what to ask the hotel for
};

const text = (v: unknown, max: number, label: string): { value: string } | { error: string } => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) return { error: `${label} must be ${max.toLocaleString()} characters or fewer.` };
  return { value: s };
};
const strings = (v: unknown, max: number) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, max) : [];

// Shape and length checks only; who may do what, and the Settings lists, are checked in resolveCampaignInput.
export function parseCampaignInput(body: unknown): { value: CampaignInput } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const { name, steps } = b;
  if (typeof name !== "string" || !name.trim()) return { error: "Give the campaign a name." };
  if (name.trim().length > 120) return { error: "The campaign name must be 120 characters or fewer." };
  const desc = text(b.description, 8000, "The description");
  if ("error" in desc) return desc;
  const pain = text(b.pain_point, 400, "The primary pain point");
  if ("error" in pain) return pain;
  const positioning = text(b.positioning, 400, "The positioning statement");
  if ("error" in positioning) return positioning;
  if (!Array.isArray(steps) || steps.length === 0) return { error: "Add at least one step." };
  if (steps.length > 40) return { error: "A campaign can have at most 40 steps." };

  const parsed: StepInput[] = [];
  for (let i = 0; i < steps.length; i++) {
    const s = (steps[i] ?? {}) as Record<string, unknown>;
    const n = i + 1;
    const day = Number(s.day_number);
    if (!Number.isInteger(day) || day < 1 || day > 365) return { error: `Step ${n}: the day must be a whole number from 1 to 365.` };
    if (typeof s.channel !== "string" || !(CHANNELS as readonly string[]).includes(s.channel)) return { error: `Step ${n}: choose a channel.` };
    const title = typeof s.title === "string" ? s.title.trim() : "";
    if (!title) return { error: `Step ${n}: give it a title.` };
    if (title.length > 200) return { error: `Step ${n}: the title must be 200 characters or fewer.` };
    const instructions = typeof s.instructions === "string" ? s.instructions.trim() : "";
    if (instructions.length > 4000) return { error: `Step ${n}: the instructions must be 4,000 characters or fewer.` };
    parsed.push({ day_number: day, channel: s.channel, title, instructions });
  }
  // Ordered by day (the order they were entered breaks ties).
  const ordered = parsed.map((s, i) => ({ s, i })).sort((a, b) => a.s.day_number - b.s.day_number || a.i - b.i).map((x) => x.s);

  const cta = text(b.call_to_action, 200, "The call to action");
  if ("error" in cta) return cta;
  const secondaryPicked = strings(b.secondary_pains, 8);
  const diffsPicked = strings(b.differentiators, 12);
  const secondaryOtherText = text(b.secondary_other, 200, "The other pain point");
  if ("error" in secondaryOtherText) return secondaryOtherText;
  const diffsOtherText = text(b.differentiators_other, 200, "The other differentiator");
  if ("error" in diffsOtherText) return diffsOtherText;
  // The custom text only counts while "Other" is ticked.
  const secondaryOther = secondaryPicked.includes("Other") ? secondaryOtherText.value : "";
  const differentiatorsOther = diffsPicked.includes("Other") ? diffsOtherText.value : "";

  const crit = (b.criteria ?? {}) as Record<string, unknown>;
  const roomsOf = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const roomsMin = roomsOf(crit.rooms_min);
  const roomsMax = roomsOf(crit.rooms_max);
  for (const r of [roomsMin, roomsMax]) if (r !== null && (!Number.isInteger(r) || r < 0 || r > 100000)) return { error: "Rooms must be whole numbers from 0 to 100,000." };
  if (roomsMin !== null && roomsMax !== null && roomsMin > roomsMax) return { error: "The minimum rooms can't be above the maximum." };
  const criteria: Criteria = {
    // a campaign aims at one kind of company
    company_types: strings(crit.company_types, 1),
    property_types: strings(crit.property_types, 30),
    rooms_min: roomsMin,
    rooms_max: roomsMax,
    portfolio: (["independent", "portfolio"].includes(String(crit.portfolio)) ? crit.portfolio : "any") as Portfolio,
    countries: strings(crit.countries, 40),
  };

  const visibility = b.visibility === "team" || b.visibility === "public" ? b.visibility : "private";
  const angle = typeof b.outreach_angle === "string" && b.outreach_angle.trim() ? b.outreach_angle.trim() : null;
  const teamId = Number(b.team_id);
  const ownerId = Number(b.owner_id);
  return {
    value: {
      name: name.trim(),
      description: desc.value,
      steps: ordered,
      visibility,
      team_id: Number.isInteger(teamId) && teamId > 0 ? teamId : null,
      owner_id: Number.isInteger(ownerId) && ownerId > 0 ? ownerId : null,
      status: b.status === "active" ? "active" : "draft",
      criteria,
      outreach_angle: angle,
      pain_point: pain.value,
      secondary_pains: strings(b.secondary_pains, 8).filter((p) => p !== angle),
      positioning: positioning.value,
      differentiators: strings(b.differentiators, 12),
      secondary_other: secondaryOther,
      differentiators_other: differentiatorsOther,
      call_to_action: cta.value,
    },
  };
}

// A campaign needs a playbook before it can go live.
export const activationError = (c: { outreach_angle: string | null; pain_point: string }) =>
  !c.outreach_angle ? "Choose the primary outreach angle before activating." : !c.pain_point.trim() ? "Write the primary pain point before activating." : null;

export type ResolvedCampaign = { visibility: Visibility; team_id: number | null; owner_id: number | null };

// Who may share with whom, who owns it, and that the angle / differentiators come from the Settings lists
// (a value that was already saved and has since been switched off is still accepted).
export async function resolveCampaignInput(
  actor: Actor,
  input: CampaignInput,
  existing?: { visibility: string; team_id: string | null; owner_id: string | null; outreach_angle: string | null; secondary_pains: string[]; differentiators: string[]; criteria?: Criteria }
): Promise<{ value: ResolvedCampaign } | { error: string }> {
  const isAdmin = actor.role === "super_admin";

  let teamId: number | null = null;
  if (input.visibility === "team") {
    if (isAdmin) {
      if (!input.team_id) return { error: "Choose which team can see this campaign." };
      const [team] = await query<{ id: string }>("SELECT id FROM teams WHERE id = $1", [input.team_id]);
      if (!team) return { error: "That team doesn't exist." };
      teamId = input.team_id;
    } else if (existing?.visibility === "team" && existing.team_id) {
      teamId = Number(existing.team_id);
    } else if (actor.team_id !== null && actor.team_id !== undefined) {
      teamId = Number(actor.team_id);
    } else {
      return { error: "You aren't in a team yet, so you can't share a campaign with one." };
    }
  }

  let ownerId: number | null = existing?.owner_id ? Number(existing.owner_id) : Number(actor.id);
  if (isAdmin && input.owner_id) {
    const [owner] = await query<{ id: string }>("SELECT id FROM users WHERE id = $1", [input.owner_id]);
    if (!owner) return { error: "That owner doesn't exist." };
    ownerId = input.owner_id;
  }

  const lists = await query<{ field_name: string; value: string }>(
    "SELECT field_name, value FROM picklist_values WHERE is_active AND field_name IN ('outreach_angle', 'key_differentiator', 'company_type', 'property_type', 'country')"
  );
  const angles = new Set(lists.filter((l) => l.field_name === "outreach_angle").map((l) => l.value));
  const diffs = new Set(lists.filter((l) => l.field_name === "key_differentiator").map((l) => l.value));
  (existing?.outreach_angle ? [existing.outreach_angle] : []).forEach((a) => angles.add(a));
  (existing?.secondary_pains ?? []).forEach((a) => angles.add(a));
  (existing?.differentiators ?? []).forEach((d) => diffs.add(d));
  if (input.outreach_angle && !angles.has(input.outreach_angle)) return { error: "That outreach angle isn't in the list." };
  if (input.secondary_pains.some((p) => !angles.has(p))) return { error: "A secondary pain point isn't in the list." };
  if (input.differentiators.some((d) => !diffs.has(d))) return { error: "A key differentiator isn't in the list." };
  const listOf = (name: string, saved: string[]) => new Set([...lists.filter((l) => l.field_name === name).map((l) => l.value), ...saved]);
  const savedC = existing?.criteria ?? EMPTY_CRITERIA;
  if (input.criteria.company_types.some((v) => !listOf("company_type", savedC.company_types).has(v))) return { error: "A company type isn't in the list." };
  if (input.criteria.property_types.some((v) => !listOf("property_type", savedC.property_types).has(v))) return { error: "A property type isn't in the list." };
  if (input.criteria.countries.some((v) => !listOf("country", savedC.countries).has(v))) return { error: "A country isn't in the list." };

  return { value: { visibility: input.visibility, team_id: teamId, owner_id: ownerId } };
}

// ---------------- who sees / manages a campaign ----------------
// Admin: all. Everyone else: their own, Public ones, their team's Team ones, and any campaign one of their
// companies is enrolled in (so running work never loses its campaign).
export function campaignVisibleSql(actor: Actor | null | undefined, alias: string, add: (v: unknown) => string): string {
  if (!actor) return "false";
  if (actor.role === "super_admin") return "true";
  const parts = [`${alias}.owner_id = ${add(actor.id)}::bigint`, `${alias}.visibility = 'public'`];
  if (actor.team_id !== null && actor.team_id !== undefined) parts.push(`(${alias}.visibility = 'team' AND ${alias}.team_id = ${add(actor.team_id)}::bigint)`);
  parts.push(
    `EXISTS (SELECT 1 FROM campaign_enrollments ve JOIN companies vc ON vc.id = ve.company_id AND vc.deleted_at IS NULL
              WHERE ve.campaign_id = ${alias}.id AND vc.owner_id = ${add(actor.id)}::bigint)`
  );
  return `(${parts.join(" OR ")})`;
}

export const canManageCampaign = (actor: Actor | null | undefined, ownerId: string | number | null) =>
  !!actor && (actor.role === "super_admin" || (ownerId !== null && String(ownerId) === String(actor.id)));

// ---------------- campaigns ----------------
// The target-audience columns, and how they map to Criteria.
export type CriteriaColumns = {
  target_company_types: string[];
  target_property_types: string[];
  rooms_min: number | null;
  rooms_max: number | null;
  target_portfolio: string;
  target_countries: string[];
};
const CRITERIA_COLUMNS = "k.target_company_types, k.target_property_types, k.rooms_min, k.rooms_max, k.target_portfolio, k.target_countries";
export const criteriaOf = (r: CriteriaColumns): Criteria => ({
  company_types: r.target_company_types,
  property_types: r.target_property_types,
  rooms_min: r.rooms_min,
  rooms_max: r.rooms_max,
  portfolio: (r.target_portfolio === "independent" || r.target_portfolio === "portfolio" ? r.target_portfolio : "any") as Portfolio,
  countries: r.target_countries,
});

export type CampaignRow = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  visibility: Visibility;
  team_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  step_count: number;
  active_enrollments: number;
  created_at: Date;
  audience: string;
  can_manage: boolean;
};

export async function fetchCampaignList(actor: Actor): Promise<CampaignRow[]> {
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const rows = await query<Omit<CampaignRow, "can_manage" | "audience"> & CriteriaColumns>(
    `SELECT k.id, k.code, k.name, k.description, k.status, k.visibility, k.created_at, k.owner_id, ou.name AS owner_name, t.name AS team_name,
            ${CRITERIA_COLUMNS},
            (SELECT count(*)::int FROM campaign_steps s WHERE s.campaign_id = k.id) AS step_count,
            (SELECT count(*)::int FROM campaign_enrollments e JOIN companies c ON c.id = e.company_id AND c.deleted_at IS NULL
              WHERE e.campaign_id = k.id AND e.status = 'active' AND ${visibleSql(actor, "c", add)}) AS active_enrollments
       FROM campaigns k
       LEFT JOIN users ou ON ou.id = k.owner_id
       LEFT JOIN teams t ON t.id = k.team_id
      WHERE ${campaignVisibleSql(actor, "k", add)}
      ORDER BY (k.status = 'active') DESC, (k.status = 'paused') DESC, (k.status = 'draft') DESC, k.created_at DESC`,
    params
  );
  return rows.map((r) => ({ ...r, audience: audienceSummary(criteriaOf(r)), can_manage: canManageCampaign(actor, r.owner_id) }));
}

export type CampaignStep = { id?: string; day_number: number; channel: string; title: string; instructions: string };
export type Playbook = {
  outreach_angle: string | null;
  pain_point: string;
  secondary_pains: string[];
  positioning: string;
  differentiators: string[];
  secondary_other: string;
  differentiators_other: string;
  call_to_action: string;
};
export type CampaignWithSteps = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  visibility: Visibility;
  team_id: string | null;
  team_name: string | null;
  owner_id: string | null;
  owner_name: string | null;
  copied_from: string | null;
  copied_from_code: string | null;
  steps: CampaignStep[];
  playbook: Playbook;
  criteria: Criteria;
  can_manage: boolean;
  running: number; // running enrollments (all of them, for the completed banner)
};

export async function fetchCampaign(id: string, actor: Actor): Promise<CampaignWithSteps | null> {
  const params: unknown[] = [id];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const [row] = await query<Omit<CampaignWithSteps, "steps" | "playbook" | "can_manage" | "criteria"> & Playbook & CriteriaColumns>(
    `SELECT k.id, k.code, k.name, k.description, k.status, k.visibility, k.team_id, t.name AS team_name, k.owner_id, ou.name AS owner_name,
            k.copied_from, src.code AS copied_from_code,
            k.outreach_angle, k.pain_point, k.secondary_pains, k.secondary_other, k.positioning, k.differentiators, k.differentiators_other, k.call_to_action, ${CRITERIA_COLUMNS},
            (SELECT count(*)::int FROM campaign_enrollments e WHERE e.campaign_id = k.id AND e.status = 'active') AS running
       FROM campaigns k
       LEFT JOIN users ou ON ou.id = k.owner_id
       LEFT JOIN teams t ON t.id = k.team_id
       LEFT JOIN campaigns src ON src.id = k.copied_from
      WHERE k.id = $1 AND ${campaignVisibleSql(actor, "k", add)}`,
    params
  );
  if (!row) return null;
  const steps = await query<CampaignStep>("SELECT id, day_number, channel, title, instructions FROM campaign_steps WHERE campaign_id = $1 ORDER BY position", [id]);
  const { outreach_angle, pain_point, secondary_pains, secondary_other, positioning, differentiators, differentiators_other, call_to_action, target_company_types, target_property_types, rooms_min, rooms_max, target_portfolio, target_countries, ...rest } = row;
  return {
    ...rest,
    criteria: criteriaOf({ target_company_types, target_property_types, rooms_min, rooms_max, target_portfolio, target_countries }),
    steps,
    playbook: { outreach_angle, pain_point, secondary_pains, secondary_other, positioning, differentiators, differentiators_other, call_to_action },
    can_manage: canManageCampaign(actor, row.owner_id),
  };
}

// Campaigns open for enrollment (visible to this person and Active), with their steps, for the Enroll dialog.
export async function fetchOpenCampaigns(actor: Actor) {
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  return query<{ id: string; code: string; name: string; description: string; status: string; steps: CampaignStep[] }>(
    `SELECT k.id, k.code, k.name, k.description, k.status,
            coalesce((SELECT json_agg(json_build_object('day_number', s.day_number, 'channel', s.channel, 'title', s.title, 'instructions', s.instructions) ORDER BY s.position)
                        FROM campaign_steps s WHERE s.campaign_id = k.id), '[]'::json) AS steps
       FROM campaigns k WHERE k.status = 'active' AND ${campaignVisibleSql(actor, "k", add)} ORDER BY lower(k.name)`,
    params
  );
}

// The playbooks of these campaigns, for the task list and the company page (people working a task see the latest text).
export async function fetchPlaybooks(ids: string[]): Promise<Record<string, Playbook>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return {};
  const rows = await query<Playbook & { id: string }>(
    "SELECT id, outreach_angle, pain_point, secondary_pains, secondary_other, positioning, differentiators, differentiators_other, call_to_action FROM campaigns WHERE id = ANY($1::bigint[])",
    [unique]
  );
  const out: Record<string, Playbook> = {};
  for (const r of rows) {
    out[r.id] = {
      outreach_angle: r.outreach_angle,
      pain_point: r.pain_point,
      secondary_pains: r.secondary_pains,
      secondary_other: r.secondary_other,
      positioning: r.positioning,
      differentiators: r.differentiators,
      differentiators_other: r.differentiators_other,
      call_to_action: r.call_to_action,
    };
  }
  return out;
}

// ---------------- a company's enrollments ----------------
export type TaskRow = {
  id: string;
  enrollment_id: string;
  step_position: number;
  step_day: number;
  step_channel: string;
  step_title: string;
  step_instructions: string;
  due_date: string;
  status: "pending" | "done" | "skipped" | "cancelled";
  completed_at: Date | null;
  completed_by_name: string | null;
  notes: string | null;
};
export type EnrollmentRow = {
  id: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  fit_label: "strong" | "partial" | "weak" | null;
  recipient_type: "contact" | "company";
  contact_id: string | null;
  recipient_label: string;
  start_date: string;
  status: "active" | "completed" | "stopped";
  stop_note: string | null;
  stopped_by_name: string | null;
  enrolled_by_name: string | null;
  tasks: TaskRow[];
};

export async function fetchCompanyEnrollments(companyId: number): Promise<EnrollmentRow[]> {
  const enrollments = await query<Omit<EnrollmentRow, "tasks">>(
    `SELECT e.id, e.campaign_id, k.name AS campaign_name, k.status AS campaign_status, e.fit_label, e.recipient_type, e.contact_id, e.recipient_label,
            to_char(e.start_date, 'YYYY-MM-DD') AS start_date, e.status, e.stop_note,
            su.name AS stopped_by_name, eu.name AS enrolled_by_name
       FROM campaign_enrollments e
       JOIN campaigns k ON k.id = e.campaign_id
       LEFT JOIN users su ON su.id = e.stopped_by
       LEFT JOIN users eu ON eu.id = e.enrolled_by
      WHERE e.company_id = $1
      ORDER BY (e.status = 'active') DESC, e.enrolled_at DESC`,
    [companyId]
  );
  if (!enrollments.length) return [];
  const tasks = await query<TaskRow>(
    `SELECT t.id, t.enrollment_id, t.step_position, t.step_day, t.step_channel, t.step_title, t.step_instructions,
            to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.status, t.completed_at, cu.name AS completed_by_name, t.notes
       FROM campaign_tasks t LEFT JOIN users cu ON cu.id = t.completed_by
      WHERE t.enrollment_id = ANY($1) ORDER BY t.enrollment_id, t.step_position`,
    [enrollments.map((e) => e.id)]
  );
  return enrollments.map((e) => ({ ...e, tasks: tasks.filter((t) => t.enrollment_id === e.id) }));
}

// ---------------- the My tasks list ----------------
export type TaskTab = "overdue" | "today" | "upcoming" | "paused" | "done";
export type TaskScope = "mine" | "team" | "all";
export type ListTask = TaskRow & {
  enrollment_status: string;
  recipient_label: string;
  campaign_id: string;
  campaign_name: string;
  campaign_status: string;
  company_id: string;
  company_name: string;
  owner_id: string | null;
  owner_name: string | null;
};

const TASK_FROM = `
  FROM campaign_tasks t
  JOIN campaign_enrollments e ON e.id = t.enrollment_id
  JOIN campaigns k ON k.id = e.campaign_id
  JOIN companies c ON c.id = e.company_id AND c.deleted_at IS NULL
  LEFT JOIN users o ON o.id = c.owner_id
  LEFT JOIN users cu ON cu.id = t.completed_by`;

const TAB_SQL: Record<TaskTab, string> = {
  // A paused campaign's tasks are held: they show under Paused and never count as due or overdue.
  overdue: `t.status = 'pending' AND e.status = 'active' AND k.status <> 'paused' AND t.due_date < ${TODAY_SQL}`,
  today: `t.status = 'pending' AND e.status = 'active' AND k.status <> 'paused' AND t.due_date = ${TODAY_SQL}`,
  upcoming: `t.status = 'pending' AND e.status = 'active' AND k.status <> 'paused' AND t.due_date > ${TODAY_SQL}`,
  paused: `t.status = 'pending' AND e.status = 'active' AND k.status = 'paused'`,
  done: `t.status IN ('done', 'skipped')`,
};

// Which tasks the viewer is looking at: their own, their team's (lead), or everyone's (admin); optionally one person's.
function scopeWhere(actor: Actor, scope: TaskScope, userId: number | null, params: unknown[]) {
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const parts: string[] = [];
  if (scope === "all" && actor.role === "super_admin") {
    // no restriction
  } else if (scope === "team" && actor.role === "team_lead" && actor.team_id) {
    parts.push(leadScopeSql(add(actor.team_id)));
  } else {
    parts.push(`c.owner_id = ${add(actor.id)}`);
  }
  if (userId !== null && (scope === "all" || scope === "team")) parts.push(`c.owner_id = ${add(userId)}`);
  return parts.length ? ` AND ${parts.join(" AND ")}` : "";
}

export async function fetchTasks(args: {
  actor: Actor;
  scope: TaskScope;
  tab: TaskTab;
  userId: number | null;
  campaignId: number | null;
}) {
  const params: unknown[] = [];
  let where = `${TAB_SQL[args.tab]}${scopeWhere(args.actor, args.scope, args.userId, params)}`;
  if (args.campaignId !== null) {
    params.push(args.campaignId);
    where += ` AND k.id = $${params.length}`;
  }
  const order = args.tab === "done" ? "t.completed_at DESC NULLS LAST" : "t.due_date ASC, c.name ASC, t.step_position ASC";

  const [rows, counts] = await Promise.all([
    query<ListTask>(
      `SELECT t.id, t.enrollment_id, t.step_position, t.step_day, t.step_channel, t.step_title, t.step_instructions,
              to_char(t.due_date, 'YYYY-MM-DD') AS due_date, t.status, t.completed_at, cu.name AS completed_by_name, t.notes,
              e.status AS enrollment_status, e.recipient_label, k.id AS campaign_id, k.name AS campaign_name, k.status AS campaign_status,
              c.id AS company_id, c.name AS company_name, c.owner_id, o.name AS owner_name
         ${TASK_FROM} WHERE ${where} ORDER BY ${order} LIMIT 200`,
      params
    ),
    (() => {
      const p: unknown[] = [];
      const scope = scopeWhere(args.actor, args.scope, args.userId, p);
      let campaign = "";
      if (args.campaignId !== null) {
        p.push(args.campaignId);
        campaign = ` AND k.id = $${p.length}`;
      }
      return query<{ tab: TaskTab; n: number }>(
        `SELECT tab, count(*)::int AS n FROM (
           SELECT CASE WHEN ${TAB_SQL.overdue} THEN 'overdue' WHEN ${TAB_SQL.today} THEN 'today'
                       WHEN ${TAB_SQL.upcoming} THEN 'upcoming' WHEN ${TAB_SQL.paused} THEN 'paused' WHEN ${TAB_SQL.done} THEN 'done' END AS tab
             ${TASK_FROM} WHERE true${scope}${campaign}
         ) x WHERE tab IS NOT NULL GROUP BY tab`,
        p
      );
    })(),
  ]);
  const count = (tab: TaskTab) => counts.find((c) => c.tab === tab)?.n ?? 0;
  return { rows, counts: { overdue: count("overdue"), today: count("today"), upcoming: count("upcoming"), paused: count("paused"), done: count("done") } };
}

export type SummaryRow = { id: string; name: string; team_name: string | null; due_today: number; overdue: number; done_week: number };

// Lead / admin: per person -- what's due today, what's overdue, what they completed in the last 7 days.
export async function fetchTaskSummary(actor: Actor): Promise<SummaryRow[]> {
  const isAdmin = actor.role === "super_admin";
  const owned = (extra: string) =>
    `(SELECT count(*)::int FROM campaign_tasks ct JOIN campaign_enrollments e ON e.id = ct.enrollment_id AND e.status = 'active'
        JOIN campaigns kk ON kk.id = e.campaign_id AND kk.status <> 'paused'
        JOIN companies c ON c.id = e.company_id AND c.deleted_at IS NULL
       WHERE c.owner_id = u.id AND ct.status = 'pending' AND ${extra})`;
  const rows = await query<SummaryRow>(
    `SELECT * FROM (
       SELECT u.id, u.name, u.role, t.name AS team_name,
              ${owned(`ct.due_date = ${TODAY_SQL}`)} AS due_today,
              ${owned(`ct.due_date < ${TODAY_SQL}`)} AS overdue,
              (SELECT count(*)::int FROM campaign_tasks ct WHERE ct.completed_by = u.id AND ct.status = 'done' AND ct.completed_at >= now() - interval '7 days') AS done_week
         FROM users u LEFT JOIN teams t ON t.id = u.team_id
        ${isAdmin ? "" : "WHERE u.team_id = $1"}
     ) x ${isAdmin ? "WHERE role <> 'super_admin' OR due_today + overdue + done_week > 0" : ""}
     ORDER BY team_name NULLS LAST, name`,
    isAdmin ? [] : [actor.team_id]
  );
  return rows;
}

// Sidebar count: this person's tasks that are due today or overdue.
export async function fetchTaskBadge(userId: number | string): Promise<number> {
  const [r] = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM campaign_tasks ct
       JOIN campaign_enrollments e ON e.id = ct.enrollment_id AND e.status = 'active'
       JOIN campaigns kk ON kk.id = e.campaign_id AND kk.status <> 'paused'
       JOIN companies c ON c.id = e.company_id AND c.deleted_at IS NULL
      WHERE c.owner_id = $1 AND ct.status = 'pending' AND ct.due_date <= ${TODAY_SQL}`,
    [userId]
  );
  return r.n;
}

// ---------------- access ----------------
// Who may act on a task / enrollment: the company's owner, a team lead for their team's companies, or an admin.
export type TaskForAction = {
  id: string;
  status: string;
  step_title: string;
  step_day: number;
  step_channel: string;
  enrollment_id: string;
  enrollment_status: string;
  campaign_name: string;
  campaign_status: string;
  recipient_label: string;
  company_id: string;
  company_name: string;
  allowed: boolean;
};

const accessSql = (actor: Actor, params: unknown[]) => {
  if (actor.role === "super_admin") return "true";
  params.push(actor.id);
  const mine = `c.owner_id = $${params.length}`;
  if (actor.role === "team_lead" && actor.team_id) {
    params.push(actor.team_id);
    return `(${mine} OR ${leadScopeSql(`$${params.length}`)})`;
  }
  return mine;
};

export async function getTaskForAction(actor: Actor, taskId: number): Promise<TaskForAction | null> {
  const params: unknown[] = [taskId];
  const [row] = await query<TaskForAction>(
    `SELECT t.id, t.status, t.step_title, t.step_day, t.step_channel, t.enrollment_id, e.status AS enrollment_status,
            k.name AS campaign_name, k.status AS campaign_status, e.recipient_label, c.id AS company_id, c.name AS company_name,
            ${accessSql(actor, params)} AS allowed
       FROM campaign_tasks t
       JOIN campaign_enrollments e ON e.id = t.enrollment_id
       JOIN campaigns k ON k.id = e.campaign_id
       JOIN companies c ON c.id = e.company_id AND c.deleted_at IS NULL
      WHERE t.id = $1`,
    params
  );
  return row ?? null;
}

export type EnrollmentForAction = {
  id: string;
  status: string;
  campaign_name: string;
  recipient_label: string;
  company_id: string;
  company_name: string;
  allowed: boolean;
};

export async function getEnrollmentForAction(actor: Actor, enrollmentId: number): Promise<EnrollmentForAction | null> {
  const params: unknown[] = [enrollmentId];
  const [row] = await query<EnrollmentForAction>(
    `SELECT e.id, e.status, k.name AS campaign_name, e.recipient_label, c.id AS company_id, c.name AS company_name,
            ${accessSql(actor, params)} AS allowed
       FROM campaign_enrollments e
       JOIN campaigns k ON k.id = e.campaign_id
       JOIN companies c ON c.id = e.company_id AND c.deleted_at IS NULL
      WHERE e.id = $1`,
    params
  );
  return row ?? null;
}

// Maps a step's channel to the company activity type shown on the timeline.
export const activityTypeFor = (channel: string) => (channel === "Email" ? "email" : channel === "Call" ? "call" : "outreach_sent");

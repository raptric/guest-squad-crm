import { query } from "@/lib/db";
import { leadScopeSql, type Actor } from "@/lib/assignment";
import { CHANNELS } from "@/lib/campaigns-format";

// Campaigns, phase 1: manual steps and tasks. "Today" is the UTC calendar date for now (per-user time zones come later).
export const READY_FOR_OUTREACH = "Ready for Outreach";
export const TODAY_SQL = "(now() AT TIME ZONE 'UTC')::date";

export type StepInput = { day_number: number; channel: string; title: string; instructions: string };
export type CampaignInput = { name: string; description: string; steps: StepInput[] };

export function parseCampaignInput(body: unknown): { value: CampaignInput } | { error: string } {
  const { name, description, steps } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || !name.trim()) return { error: "Give the campaign a name." };
  if (name.trim().length > 120) return { error: "The campaign name must be 120 characters or fewer." };
  const desc = typeof description === "string" ? description.trim() : "";
  if (desc.length > 8000) return { error: "The description must be 8,000 characters or fewer." };
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
  return { value: { name: name.trim(), description: desc, steps: ordered } };
}

// ---------------- campaigns ----------------
export type CampaignRow = { id: string; name: string; description: string; status: string; step_count: number; active_enrollments: number; created_at: Date };

export const fetchCampaignList = () =>
  query<CampaignRow>(
    `SELECT k.id, k.name, k.description, k.status, k.created_at,
            (SELECT count(*)::int FROM campaign_steps s WHERE s.campaign_id = k.id) AS step_count,
            (SELECT count(*)::int FROM campaign_enrollments e WHERE e.campaign_id = k.id AND e.status = 'active') AS active_enrollments
       FROM campaigns k ORDER BY (k.status = 'active') DESC, lower(k.name)`
  );

export type CampaignStep = { id?: string; day_number: number; channel: string; title: string; instructions: string };
export type CampaignWithSteps = { id: string; name: string; description: string; status: string; steps: CampaignStep[] };

export async function fetchCampaign(id: string): Promise<CampaignWithSteps | null> {
  const [campaign] = await query<Omit<CampaignWithSteps, "steps">>("SELECT id, name, description, status FROM campaigns WHERE id = $1", [id]);
  if (!campaign) return null;
  const steps = await query<CampaignStep>(
    "SELECT id, day_number, channel, title, instructions FROM campaign_steps WHERE campaign_id = $1 ORDER BY position",
    [id]
  );
  return { ...campaign, steps };
}

// Active campaigns with their steps, for the Enroll dialog.
export async function fetchActiveCampaigns(): Promise<CampaignWithSteps[]> {
  const rows = await query<Omit<CampaignWithSteps, "steps"> & { steps: CampaignStep[] }>(
    `SELECT k.id, k.name, k.description, k.status,
            coalesce((SELECT json_agg(json_build_object('day_number', s.day_number, 'channel', s.channel, 'title', s.title, 'instructions', s.instructions) ORDER BY s.position)
                        FROM campaign_steps s WHERE s.campaign_id = k.id), '[]'::json) AS steps
       FROM campaigns k WHERE k.status = 'active' ORDER BY lower(k.name)`
  );
  return rows;
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
    `SELECT e.id, e.campaign_id, k.name AS campaign_name, e.recipient_type, e.contact_id, e.recipient_label,
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
export type TaskTab = "overdue" | "today" | "upcoming" | "done";
export type TaskScope = "mine" | "team" | "all";
export type ListTask = TaskRow & {
  enrollment_status: string;
  recipient_label: string;
  campaign_id: string;
  campaign_name: string;
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
  overdue: `t.status = 'pending' AND e.status = 'active' AND t.due_date < ${TODAY_SQL}`,
  today: `t.status = 'pending' AND e.status = 'active' AND t.due_date = ${TODAY_SQL}`,
  upcoming: `t.status = 'pending' AND e.status = 'active' AND t.due_date > ${TODAY_SQL}`,
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
              e.status AS enrollment_status, e.recipient_label, k.id AS campaign_id, k.name AS campaign_name,
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
                       WHEN ${TAB_SQL.upcoming} THEN 'upcoming' WHEN ${TAB_SQL.done} THEN 'done' END AS tab
             ${TASK_FROM} WHERE true${scope}${campaign}
         ) x WHERE tab IS NOT NULL GROUP BY tab`,
        p
      );
    })(),
  ]);
  const count = (tab: TaskTab) => counts.find((c) => c.tab === tab)?.n ?? 0;
  return { rows, counts: { overdue: count("overdue"), today: count("today"), upcoming: count("upcoming"), done: count("done") } };
}

export type SummaryRow = { id: string; name: string; team_name: string | null; due_today: number; overdue: number; done_week: number };

// Lead / admin: per person -- what's due today, what's overdue, what they completed in the last 7 days.
export async function fetchTaskSummary(actor: Actor): Promise<SummaryRow[]> {
  const isAdmin = actor.role === "super_admin";
  const owned = (extra: string) =>
    `(SELECT count(*)::int FROM campaign_tasks ct JOIN campaign_enrollments e ON e.id = ct.enrollment_id AND e.status = 'active'
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
            k.name AS campaign_name, e.recipient_label, c.id AS company_id, c.name AS company_name,
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

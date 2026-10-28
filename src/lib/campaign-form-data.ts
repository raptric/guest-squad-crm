import { query } from "@/lib/db";
import type { Actor } from "@/lib/assignment";

// What the campaign form needs besides the campaign itself: the Settings lists, the teams an admin can pick from
// (everyone else only has their own), and the people an admin can hand a campaign to.
export async function loadCampaignFormData(actor: Actor & { name: string }) {
  const isAdmin = actor.role === "super_admin";
  const [lists, teams, users, states] = await Promise.all([
    query<{ field_name: string; value: string }>(
      "SELECT field_name, value FROM picklist_values WHERE is_active AND field_name IN ('outreach_angle', 'key_differentiator', 'company_type', 'property_type', 'country') ORDER BY sort_order, id"
    ),
    isAdmin
      ? query<{ id: string; name: string }>("SELECT id, name FROM teams ORDER BY name")
      : actor.team_id !== null && actor.team_id !== undefined
        ? query<{ id: string; name: string }>("SELECT id, name FROM teams WHERE id = $1", [actor.team_id])
        : Promise.resolve([] as { id: string; name: string }[]),
    isAdmin ? query<{ id: string; name: string }>("SELECT id, name FROM users ORDER BY name") : Promise.resolve([] as { id: string; name: string }[]),
    // the state values as they are written in the data today (target states are matched as written)
    query<{ state: string }>("SELECT state FROM companies WHERE deleted_at IS NULL AND state IS NOT NULL GROUP BY state ORDER BY count(*) DESC, state LIMIT 120"),
  ]);
  return {
    lists: {
      angles: lists.filter((l) => l.field_name === "outreach_angle").map((l) => l.value),
      differentiators: lists.filter((l) => l.field_name === "key_differentiator").map((l) => l.value),
      companyTypes: lists.filter((l) => l.field_name === "company_type").map((l) => l.value),
      propertyTypes: lists.filter((l) => l.field_name === "property_type").map((l) => l.value),
      countries: lists.filter((l) => l.field_name === "country").map((l) => l.value),
      states: states.map((s) => s.state),
    },
    teams,
    users,
    viewer: {
      role: actor.role,
      id: String(actor.id),
      name: actor.name,
      teamId: actor.team_id !== null && actor.team_id !== undefined ? String(actor.team_id) : null,
      teamName: teams.find((t) => String(t.id) === String(actor.team_id))?.name ?? null,
    },
  };
}

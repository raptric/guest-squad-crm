import { query } from "@/lib/db";
import { READY_FOR_OUTREACH } from "@/lib/campaigns";
import { allowedLabel, type AllowedEntry, type EnrollmentRule } from "@/lib/campaign-rule-format";

export type { AllowedEntry, EnrollmentRule };

// The "who can be enrolled in a campaign" rule from Settings -> Rules. Admins set whether the company has to be verified
// and which status / stage combinations are allowed (none listed = any stage).
export async function fetchEnrollmentRule(): Promise<EnrollmentRule> {
  const [[rule], allowed] = await Promise.all([
    query<{ require_verified: boolean }>("SELECT require_verified FROM campaign_enrollment_rule WHERE id = 1"),
    query<AllowedEntry>(
      `SELECT a.id::text, a.status_id::text, a.stage_id::text, s.name AS status_name, g.name AS stage_name,
              (s.is_active AND (g.id IS NULL OR g.is_active)) AS active
         FROM campaign_enrollment_allowed a
         JOIN pipeline_statuses s ON s.id = a.status_id
         LEFT JOIN pipeline_stages g ON g.id = a.stage_id
        ORDER BY s.sort_order, g.sort_order NULLS FIRST, a.id`
    ),
  ]);
  return { require_verified: rule?.require_verified ?? true, allowed };
}

export type EnrollCandidate = {
  verification_status: string | null;
  pipeline_status_id: string | number | null;
  pipeline_stage_id: string | number | null;
  status_name: string | null;
  stage_name: string | null;
};

// Can this company be enrolled, under the rule? Entries that point at a switched-off status / stage are ignored, so a
// stale setting can never lock everyone out (if none are left, any stage is allowed).
export function checkEnrollable(rule: EnrollmentRule, c: EnrollCandidate): { ok: true } | { ok: false; reason: string } {
  if (rule.require_verified && c.verification_status !== READY_FOR_OUTREACH) {
    return { ok: false, reason: "This company must be verified before it can be enrolled in a campaign." };
  }
  const live = rule.allowed.filter((e) => e.active);
  if (live.length > 0) {
    const sid = c.pipeline_status_id === null ? null : String(c.pipeline_status_id);
    const gid = c.pipeline_stage_id === null ? null : String(c.pipeline_stage_id);
    const allowed = live.some((e) => e.status_id === sid && (e.stage_id === null || e.stage_id === gid));
    if (!allowed) {
      const where = c.status_name ? `${c.status_name} / ${c.stage_name ?? "no stage"}` : "no status";
      return { ok: false, reason: `Companies at ${where} can't be enrolled. Allowed: ${live.map(allowedLabel).join(", ")}.` };
    }
  }
  return { ok: true };
}

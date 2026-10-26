// Client-safe types for the campaign enrollment rule (no server imports), shared by Settings and the server logic.
export type AllowedEntry = { id: string; status_id: string; stage_id: string | null; status_name: string; stage_name: string | null; active: boolean };
export type EnrollmentRule = { require_verified: boolean; allowed: AllowedEntry[] };

export const allowedLabel = (e: { status_name: string; stage_name: string | null }) => `${e.status_name} › ${e.stage_name ?? "Any stage"}`;

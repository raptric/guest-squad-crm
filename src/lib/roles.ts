// Roles are stored as 'user' | 'team_lead' | 'super_admin'; this is how they're shown to people.
export const ROLES = ["user", "team_lead", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  user: "User",
  team_lead: "Team Lead",
  super_admin: "Admin",
};

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

export const ROLE_CHIP: Record<string, string> = {
  user: "bg-zinc-100 text-zinc-700",
  team_lead: "bg-sky-100 text-sky-800",
  super_admin: "bg-violet-100 text-violet-800",
};

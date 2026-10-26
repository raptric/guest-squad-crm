// Filters for the Companies page. Everything lives in the URL so a filtered view can be bookmarked or
// shared. Safe to import from server and client code (no server-only imports).
export const PAGE_SIZES = [25, 50, 100] as const;

export const SORTS = ["created", "name", "city", "tier", "status", "owner", "rating", "rooms"] as const;
export type SortKey = (typeof SORTS)[number];

export const PORTFOLIO_OPTIONS = [
  { value: "independent", label: "Independent properties" },
  { value: "portfolio", label: "Portfolio properties (part of a group)" },
  { value: "groups", label: "Groups & management companies" },
] as const;

export const VERIFICATION_OPTIONS = ["Ready for Outreach", "Qualified - Incomplete", "Not verified"] as const;
export const NO_TIER = "No tier";

export const HAS_OPTIONS = [
  { value: "has", label: "Has" },
  { value: "missing", label: "Missing" },
] as const;

export type Filters = {
  q: string;
  status: string[];
  stage: string[];
  verification: string[];
  tier: string[];
  country: string[];
  state: string[];
  city: string;
  ctype: string[];
  ptype: string[];
  pclass: string[];
  portfolio: string;
  group: string;
  owner: string[];
  team: string[];
  batch: string[];
  source: string[];
  website: string;
  phone: string;
  email: string;
  contacts: string;
  roomsMin: string;
  roomsMax: string;
  ratingMin: string;
  addedFrom: string;
  addedTo: string;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
  size: number;
};

type Raw = Record<string, string | string[] | undefined>;

// NUL bytes can't be stored or compared in Postgres text, so they're dropped from every value.
const clean = (s: string) => s.replace(/\u0000/g, "").trim();
const list = (raw: Raw, key: string): string[] => {
  const v = raw[key];
  return (Array.isArray(v) ? v : v ? [v] : []).map(clean).filter(Boolean).slice(0, 60);
};
const one = (raw: Raw, key: string, max = 100): string => {
  const v = raw[key];
  return clean(Array.isArray(v) ? v[0] : v ?? "").slice(0, max);
};
const oneOf = (value: string, allowed: readonly string[]) => (allowed.includes(value) ? value : "");
const intStr = (value: string) => (/^\d{1,7}$/.test(value) ? value : "");
const numStr = (value: string) => (/^\d{1,2}(\.\d{1,2})?$/.test(value) ? value : "");
const dateStr = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "");

export function parseFilters(raw: Raw): Filters {
  const sort = oneOf(one(raw, "sort"), SORTS) as SortKey | "";
  const size = parseInt(one(raw, "size"), 10);
  const hasOpt = (key: string) => oneOf(one(raw, key), HAS_OPTIONS.map((o) => o.value));
  return {
    q: one(raw, "q"),
    status: list(raw, "status"),
    stage: list(raw, "stage"),
    verification: list(raw, "verification"),
    tier: list(raw, "tier"),
    country: list(raw, "country"),
    state: list(raw, "state"),
    city: one(raw, "city"),
    ctype: list(raw, "ctype"),
    ptype: list(raw, "ptype"),
    pclass: list(raw, "pclass"),
    portfolio: oneOf(one(raw, "portfolio"), PORTFOLIO_OPTIONS.map((o) => o.value)),
    group: one(raw, "group"),
    owner: list(raw, "owner"),
    team: list(raw, "team"),
    batch: list(raw, "batch"),
    source: list(raw, "source"),
    website: hasOpt("website"),
    phone: hasOpt("phone"),
    email: hasOpt("email"),
    contacts: hasOpt("contacts"),
    roomsMin: intStr(one(raw, "roomsMin")),
    roomsMax: intStr(one(raw, "roomsMax")),
    ratingMin: numStr(one(raw, "ratingMin")),
    addedFrom: dateStr(one(raw, "addedFrom")),
    addedTo: dateStr(one(raw, "addedTo")),
    sort: sort || "created",
    dir: one(raw, "dir") === "asc" ? "asc" : "desc",
    page: Math.max(1, parseInt(one(raw, "page"), 10) || 1),
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : 25,
  };
}

// Quick filters shown as pills above the table. Each one replaces the current filters.
export const PRESETS: { label: string; params: Record<string, string | string[]> }[] = [
  { label: "All", params: {} },
  { label: "Qualified", params: { status: "Qualified" } },
  { label: "Needs verification", params: { status: "Qualified", verification: "Not verified" } },
  { label: "Ready for outreach", params: { verification: "Ready for Outreach" } },
  { label: "In outreach", params: { status: "Prospect" } },
  { label: "Nurture", params: { status: "Nurture" } },
  { label: "Unassigned", params: { owner: "unassigned" } },
  { label: "Independent", params: { portfolio: "independent" } },
  { label: "Portfolio properties", params: { portfolio: "portfolio" } },
  { label: "Groups", params: { portfolio: "groups" } },
];

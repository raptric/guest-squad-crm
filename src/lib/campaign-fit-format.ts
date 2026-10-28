// Client-safe pieces of the campaign "fit": the criteria, how a result reads, and the labels. The judging itself
// happens in SQL (campaign-fit.ts) so the company page, the fit list and the preview can never disagree.

export type Portfolio = "any" | "independent" | "portfolio";
export type Criteria = {
  company_types: string[];
  property_types: string[];
  rooms_min: number | null;
  rooms_max: number | null;
  portfolio: Portfolio;
  countries: string[];
  states: string[];
};
export const EMPTY_CRITERIA: Criteria = { company_types: [], property_types: [], rooms_min: null, rooms_max: null, portfolio: "any", countries: [], states: [] };
export const PORTFOLIO_LABEL: Record<string, string> = { any: "Any", independent: "Independent", portfolio: "Part of a portfolio" };

export type FitLabel = "strong" | "partial" | "weak";
export const FIT_TEXT: Record<FitLabel, string> = { strong: "Strong fit", partial: "Partial fit", weak: "Weak fit" };
export const FIT_CHIP: Record<FitLabel, string> = {
  strong: "bg-emerald-100 text-emerald-800",
  partial: "bg-amber-100 text-amber-800",
  weak: "bg-red-100 text-red-700",
};

export type Result = "match" | "miss" | "unknown" | "na" | null;
export type FitLine = { criterion: string; result: "match" | "miss" | "unknown"; text: string };
export type Fit = { label: FitLabel | null; misses: number; unknowns: number; lines: FitLine[] };

// What the SQL evaluator returns for one company and one campaign.
export type FitRow = {
  ct: Result;
  pt: Result;
  rooms: Result;
  portfolio: Result;
  location: Result;
  misses: number;
  unknowns: number;
  has_criteria: boolean;
  fit: FitLabel | null;
  // the company's values, for the explanation
  company_type: string;
  property_type: string | null;
  rooms_units: number | null;
  is_independent: boolean;
  country: string | null;
  state: string | null;
  // the campaign's criteria, for the explanation
  target_company_types: string[];
  target_property_types: string[];
  rooms_min: number | null;
  rooms_max: number | null;
  target_portfolio: string;
  target_countries: string[];
  target_states: string[];
};

const roomsRange = (min: number | null, max: number | null) => (min !== null && max !== null ? `${min}–${max}` : min !== null ? `${min}+` : `up to ${max}`);

// One line per criterion the campaign sets: what the company has, and whether it fits.
export function describeFit(r: FitRow): Fit {
  const lines: FitLine[] = [];
  const add = (criterion: string, result: Result, value: string | null, target: string) => {
    if (result === null || result === "na") return;
    lines.push({
      criterion,
      result,
      text: result === "unknown" ? `${criterion}: not recorded` : result === "match" ? `${criterion}: ${value}` : `${criterion}: ${value}, outside the target (${target})`,
    });
  };
  add("Company type", r.ct, r.company_type, r.target_company_types.join(", "));
  add("Property type", r.pt, r.property_type, r.target_property_types.join(", "));
  add("Rooms", r.rooms, r.rooms_units === null ? null : String(r.rooms_units), roomsRange(r.rooms_min, r.rooms_max));
  add("Portfolio", r.portfolio, r.is_independent ? "Independent" : "Part of a portfolio", PORTFOLIO_LABEL[r.target_portfolio] ?? r.target_portfolio);
  add(
    "Location",
    r.location,
    [r.state, r.country].filter(Boolean).join(", "),
    [...r.target_states, ...r.target_countries].join(", ")
  );
  return { label: r.has_criteria ? r.fit : null, misses: r.misses, unknowns: r.unknowns, lines };
}

// "Boutique Hotel, B&B · 10–80 rooms · United States · Independent" -- a one-line summary for the campaign list.
export function audienceSummary(c: Criteria): string {
  const parts: string[] = [];
  if (c.company_types.length) parts.push(c.company_types.join(", "));
  if (c.property_types.length) parts.push(c.property_types.join(", "));
  if (c.rooms_min !== null || c.rooms_max !== null) parts.push(`${roomsRange(c.rooms_min, c.rooms_max)} rooms`);
  if (c.states.length || c.countries.length) parts.push([...c.states, ...c.countries].join(", "));
  if (c.portfolio !== "any") parts.push(PORTFOLIO_LABEL[c.portfolio]);
  return parts.join(" · ");
}

export function matchEnum(
  value: string | undefined,
  allowed: readonly string[],
  fallback: string | null
) {
  if (!value) return fallback;
  const hit = allowed.find((a) => a.toLowerCase() === value.toLowerCase());
  return hit ?? fallback;
}

// Strips protocol/www/trailing slash so "https://www.foo.com/" and "foo.com" match.
export function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  "united states of america": "United States",
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  turkiye: "Turkey",
  "türkiye": "Turkey",
  uae: "United Arab Emirates",
};

// Maps common spellings/aliases onto the Country dropdown; unknown values become null.
export function matchCountry(value: string | undefined, allowed: readonly string[]) {
  if (!value) return null;
  const trimmed = value.trim();
  return matchEnum(COUNTRY_ALIASES[trimmed.toLowerCase()] ?? trimmed, allowed, null);
}

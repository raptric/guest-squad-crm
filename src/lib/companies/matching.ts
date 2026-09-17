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

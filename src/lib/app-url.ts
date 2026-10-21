import { headers } from "next/headers";

// The public origin of this app, used to build links in emails (invite, password reset).
// NEXT_PUBLIC_APP_URL is preferred, but it has twice been saved as an empty string in Vercel --
// which silently produced a relative "/reset-password" link that Supabase rejected, sending
// invitees to a Vercel-protected URL. Fall back to the host the request actually came in on so
// a blank or missing env var can't break auth emails again. Server-side only.
export async function getAppOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

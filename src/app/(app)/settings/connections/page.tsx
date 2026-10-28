import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/current-user";
import { McpConnection } from "../mcp-connection";
import { SettingsHeader } from "../settings-header";

export const dynamic = "force-dynamic";

export default async function ConnectionsSettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  // NEXT_PUBLIC_APP_URL is this app's own source of truth for its URL (also used for auth
  // redirect links); fall back to the request's own host if it isn't set.
  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL || `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;
  const mcpUrl = `${origin.replace(/\/$/, "")}/api/mcp`;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <SettingsHeader title="Connections" description="Outside tools that work with the CRM." />
      <McpConnection mcpUrl={mcpUrl} apiKey={process.env.MCP_API_KEY ?? null} />
    </div>
  );
}

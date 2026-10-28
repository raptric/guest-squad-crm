import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { aiSecretConfigured } from "@/lib/ai/crypto";
import { PROVIDER_LABEL } from "@/lib/ai/providers";
import { fetchAiSettings, fetchRecentUsage, fetchUsageTotals } from "@/lib/ai/settings";
import { AiHeader } from "./ai-header";
import { ProvidersPanel } from "./providers-panel";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

// Settings -> AI -> Providers & usage. Admin only: the AI services, their keys, the one in use, and a log of every call.
export default async function AiSettingsPage() {
  const user = await getCurrentUser();
  if (user?.role !== "super_admin") redirect("/");

  const [settings, usage, totals] = await Promise.all([fetchAiSettings(), fetchRecentUsage(), fetchUsageTotals()]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 lg:p-8">
      <AiHeader description={`Choose the AI service the CRM uses to write copy. ${settings.activeProvider ? `Now using ${PROVIDER_LABEL[settings.activeProvider]}.` : "No service is in use yet."}`} />

      <ProvidersPanel settings={settings} secretReady={aiSecretConfigured()} />

      <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-900">Usage</h2>
          <p className="text-xs text-zinc-500">
            Today: {totals.calls_today} calls · Last 30 days: {totals.calls_30d} calls, {(totals.input_30d + totals.output_30d).toLocaleString()} tokens
          </p>
        </div>
        {usage.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing yet. Every call to an AI service is listed here, including connection tests.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3">When</th>
                  <th className="px-3 py-2">Who</th>
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">For</th>
                  <th className="px-3 py-2 text-right">Tokens</th>
                  <th className="py-2 pl-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {usage.map((u) => (
                  <tr key={u.id}>
                    <td className="whitespace-nowrap py-2 pr-3 text-zinc-600">{when(u.created_at)}</td>
                    <td className="px-3 py-2 text-zinc-600">{u.user_name ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-600">
                      {PROVIDER_LABEL[u.provider]}
                      <span className="block font-mono text-xs text-zinc-400">{u.model}</span>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{u.purpose === "test" ? "Connection test" : u.purpose}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{u.input_tokens !== null ? (u.input_tokens + (u.output_tokens ?? 0)).toLocaleString() : "—"}</td>
                    <td className="py-2 pl-3">{u.ok ? <span className="text-emerald-700">OK</span> : <span className="text-red-600" title={u.error ?? ""}>Failed</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

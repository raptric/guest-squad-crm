"use client";

import { useState } from "react";

function CopyButton({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setStatus("copied");
        } catch {
          // Clipboard access can be denied (permissions, non-secure context) -- fall back to
          // select-and-Ctrl+C instead of failing silently with no feedback.
          setStatus("failed");
        }
        setTimeout(() => setStatus("idle"), 1500);
      }}
      className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
    >
      {status === "copied" ? "Copied" : status === "failed" ? "Select & Ctrl+C" : "Copy"}
    </button>
  );
}

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm text-zinc-900 ${mono ? "font-mono" : ""}`}
        />
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function CopyBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md bg-zinc-900 px-4 py-3 text-xs text-zinc-100">
        <code>{code}</code>
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton value={code} />
      </div>
    </div>
  );
}

export function McpConnection({ mcpUrl, apiKey }: { mcpUrl: string; apiKey: string | null }) {
  const [revealed, setRevealed] = useState(false);
  const envVarName = "GUESTSQUAD_MCP_TOKEN";
  const masked = apiKey ? "•".repeat(Math.min(apiKey.length, 40)) : "";

  return (
    <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-6">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">MCP Connection (Codex research agent)</h2>
        <p className="text-xs text-zinc-500">
          Lets a research agent (Codex) read companies and write back research findings. Everything it
          writes is stored unverified until a human reviews it.
        </p>
      </div>

      {!apiKey && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          MCP_API_KEY is not set in this environment. Set it before connecting an agent — the endpoint
          rejects every request without it.
        </p>
      )}

      <CopyField label="Server URL" value={mcpUrl} />

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-700">Bearer token (MCP_API_KEY)</label>
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            disabled={!apiKey}
            className="text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-40"
          >
            {revealed ? "Hide" : "Reveal"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={revealed ? (apiKey ?? "") : masked}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1.5 font-mono text-sm text-zinc-900"
          />
          <CopyButton value={apiKey ?? ""} />
        </div>
        <p className="text-xs text-zinc-500">
          Treat this like a password — anyone with it can read and write CRM data through the agent
          tools. Copy it into the environment variable below rather than pasting it directly into a
          config file you might share or commit.
        </p>
      </div>

      <div className="space-y-3 border-t border-zinc-100 pt-4">
        <p className="text-xs font-medium text-zinc-700">Connect with Codex CLI</p>

        <div className="space-y-1">
          <p className="text-xs text-zinc-500">
            1. In the shell where you run Codex, set the token as an environment variable:
          </p>
          <CopyBlock code={`export ${envVarName}=${apiKey ?? "<paste the token above>"}`} />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-zinc-500">2. Add the server:</p>
          <CopyBlock
            code={`codex mcp add guestsquad-crm --url ${mcpUrl} --bearer-token-env-var ${envVarName}`}
          />
        </div>

        <div className="space-y-1">
          <p className="text-xs text-zinc-500">
            Or edit <code className="rounded bg-zinc-100 px-1 py-0.5">~/.codex/config.toml</code> directly:
          </p>
          <CopyBlock
            code={`[mcp_servers.guestsquad-crm]\nurl = "${mcpUrl}"\nbearer_token_env_var = "${envVarName}"`}
          />
        </div>

        <p className="text-xs text-zinc-500">
          The environment variable must be set before Codex starts. Restart the Codex CLI or desktop
          app after adding it.
        </p>
      </div>

      <div className="space-y-2 border-t border-zinc-100 pt-4">
        <p className="text-xs font-medium text-zinc-700">What the agent can do</p>
        <p className="text-xs text-zinc-500">
          list_companies, get_company, find_or_create_company, link_company_to_parent,
          update_qualification, update_property_profile, find_or_create_contact, add_rating,
          add_signal, add_hiring_signal, add_pain_signal, log_activity, set_research_outcome.
          Offer recommendations stay SDR-managed and are not exposed to the agent.
        </p>
      </div>
    </section>
  );
}

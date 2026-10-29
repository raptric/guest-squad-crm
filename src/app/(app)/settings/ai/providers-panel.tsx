"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PROVIDER_LABEL, type ProviderId } from "@/lib/ai/providers";
import type { AiSettings, ProviderSettings } from "@/lib/ai/settings";

const input = "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:opacity-50";
const primary = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50";
const secondary = "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

const HELP: Record<ProviderId, { where: string; url: string }> = {
  anthropic: { where: "console.anthropic.com → API keys", url: "https://console.anthropic.com/settings/keys" },
  openai: { where: "platform.openai.com → API keys", url: "https://platform.openai.com/api-keys" },
};

type Note = { kind: "ok" | "error"; text: string } | null;

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

function ProviderCard({ p, active, secretReady }: { p: ProviderSettings; active: boolean; secretReady: boolean }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(p.model);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);

  async function run(label: string, fn: () => Promise<Note>) {
    setBusy(label);
    setNote(null);
    const n = await fn();
    setBusy(null);
    setNote(n);
    router.refresh();
  }

  const saveKey = () =>
    run("key", async () => {
      const r = await send(`/api/admin/ai/providers/${p.provider}`, "PATCH", { api_key: apiKey });
      if (!r.ok) return { kind: "error", text: String(r.data.error ?? "Couldn't save the key") };
      setApiKey("");
      return { kind: "ok", text: "Key saved." };
    });

  const removeKey = () =>
    run("remove", async () => {
      if (!window.confirm(`Remove the saved ${PROVIDER_LABEL[p.provider]} key?`)) return null;
      const r = await send(`/api/admin/ai/providers/${p.provider}`, "PATCH", { clear_key: true });
      return r.ok ? { kind: "ok", text: "Key removed." } : { kind: "error", text: String(r.data.error ?? "Couldn't remove the key") };
    });

  const saveModel = () =>
    run("model", async () => {
      const r = await send(`/api/admin/ai/providers/${p.provider}`, "PATCH", { model });
      return r.ok ? { kind: "ok", text: "Model saved." } : { kind: "error", text: String(r.data.error ?? "Couldn't save the model") };
    });

  const loadModels = () =>
    run("models", async () => {
      const res = await fetch(`/api/admin/ai/models?provider=${p.provider}`);
      const data = (await res.json().catch(() => ({}))) as { models?: string[]; error?: string };
      if (!res.ok) return { kind: "error", text: data.error ?? "Couldn't load the models" };
      setModels(data.models ?? []);
      return { kind: "ok", text: `${data.models?.length ?? 0} models available to this key. Start typing in the model box to pick one.` };
    });

  const test = () =>
    run("test", async () => {
      const r = await send("/api/admin/ai/test", "POST", { provider: p.provider });
      return r.ok ? { kind: "ok", text: `Works. The model answered “${String(r.data.reply)}” in ${(Number(r.data.ms) / 1000).toFixed(1)}s.` } : { kind: "error", text: String(r.data.error ?? "The test failed") };
    });

  const setActive = (on: boolean) =>
    run("active", async () => {
      const r = await send("/api/admin/ai/settings", "PATCH", { active_provider: on ? p.provider : null });
      return r.ok ? { kind: "ok", text: on ? `${PROVIDER_LABEL[p.provider]} is now in use.` : "No provider is in use." } : { kind: "error", text: String(r.data.error ?? "Couldn't change it") };
    });

  const modelChanged = model.trim() !== p.model;

  return (
    <section className={`space-y-4 rounded-2xl border bg-white p-5 shadow-sm ${active ? "border-sky-300" : "border-zinc-200"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-900">{PROVIDER_LABEL[p.provider]}</h2>
        {active ? (
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800">In use</span>
        ) : (
          <span className="text-xs text-zinc-400">Not in use</span>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-zinc-700">API key</label>
        {p.hasKey && (
          <p className="text-sm text-zinc-600">
            Saved, ending in <span className="font-mono">{p.keyLast4}</span>. It is stored encrypted and can&apos;t be shown again.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            type="password"
            autoComplete="new-password"
            data-lpignore="true"
            spellCheck={false}
            value={apiKey}
            disabled={busy !== null || !secretReady}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={p.hasKey ? "Paste a new key to replace it" : "Paste the key here"}
            className={`${input} min-w-0 flex-1`}
          />
          <button onClick={saveKey} disabled={busy !== null || !apiKey.trim() || !secretReady} className={primary}>
            {busy === "key" ? "Saving…" : p.hasKey ? "Replace key" : "Save key"}
          </button>
          {p.hasKey && (
            <button onClick={removeKey} disabled={busy !== null} className={`${secondary} text-red-700`}>
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Create one at{" "}
          <a href={HELP[p.provider].url} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
            {HELP[p.provider].where}
          </a>
          . Usage is billed to that account.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-zinc-700">Model</label>
        <div className="flex flex-wrap gap-2">
          <input
            list={`models-${p.provider}`}
            value={model}
            disabled={busy !== null}
            onChange={(e) => setModel(e.target.value)}
            placeholder={p.provider === "openai" ? "Load the list, then pick one" : "e.g. claude-sonnet-5-5"}
            className={`${input} min-w-0 flex-1 font-mono`}
          />
          <datalist id={`models-${p.provider}`}>
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button onClick={saveModel} disabled={busy !== null || !modelChanged} className={primary}>
            {busy === "model" ? "Saving…" : "Save model"}
          </button>
          <button onClick={loadModels} disabled={busy !== null || !p.hasKey} className={secondary}>
            {busy === "models" ? "Loading…" : "Load my models"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-4">
        <button onClick={test} disabled={busy !== null || !p.hasKey || !p.model || modelChanged} className={secondary}>
          {busy === "test" ? "Testing…" : "Test connection"}
        </button>
        {active ? (
          <button onClick={() => setActive(false)} disabled={busy !== null} className={secondary}>
            Stop using
          </button>
        ) : (
          <button onClick={() => setActive(true)} disabled={busy !== null || !p.hasKey || !p.model} className={primary}>
            Use {p.provider === "openai" ? "ChatGPT" : "Claude"}
          </button>
        )}
        {busy && <span className="text-xs text-zinc-400">Working…</span>}
      </div>
      {note && <p className={`text-sm ${note.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>{note.text}</p>}
    </section>
  );
}

function Writing({ settings }: { settings: AiSettings }) {
  const router = useRouter();
  const [limit, setLimit] = useState(String(settings.dailyLimit));
  const [variants, setVariants] = useState(String(settings.variants));
  const [creativity, setCreativity] = useState<string>(settings.creativity);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const changed = limit !== String(settings.dailyLimit) || variants !== String(settings.variants) || creativity !== settings.creativity;

  async function save() {
    setBusy(true);
    setNote(null);
    const r = await send("/api/admin/ai/settings", "PATCH", { daily_limit: Number(limit), variants: Number(variants), creativity });
    setBusy(false);
    setNote(r.ok ? { kind: "ok", text: "Saved." } : { kind: "error", text: String(r.data.error ?? "Couldn't save") });
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">Writing settings</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-sm font-medium text-zinc-700">Versions per click</span>
          <select value={variants} onChange={(e) => setVariants(e.target.value)} className={input}>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
          <span className="block text-xs text-zinc-500">How many different emails to write each time.</span>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-zinc-700">Creativity</span>
          <select value={creativity} onChange={(e) => setCreativity(e.target.value)} className={input}>
            <option value="low">Low (safe, consistent)</option>
            <option value="medium">Medium</option>
            <option value="high">High (more varied)</option>
          </select>
          <span className="block text-xs text-zinc-500">How adventurous the wording is.</span>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium text-zinc-700">Daily limit</span>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={1000} value={limit} onChange={(e) => setLimit(e.target.value)} className={`${input} w-24`} />
            <span className="text-sm text-zinc-500">per person</span>
          </div>
          <span className="block text-xs text-zinc-500">AI writes each person can ask for per day. It keeps costs predictable.</span>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy || !changed} className={primary}>
          {busy ? "Saving…" : "Save"}
        </button>
        {note && <span className={`text-sm ${note.kind === "ok" ? "text-emerald-700" : "text-red-600"}`}>{note.text}</span>}
      </div>
    </section>
  );
}

export function ProvidersPanel({ settings, secretReady }: { settings: AiSettings; secretReady: boolean }) {
  return (
    <div className="space-y-5">
      {!secretReady && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This server has no <span className="font-mono">AI_KEY_SECRET</span> set, so API keys can&apos;t be saved or used here. Add it in the environment settings and redeploy.
        </p>
      )}
      {settings.providers.map((p) => (
        <ProviderCard key={p.provider} p={p} active={settings.activeProvider === p.provider} secretReady={secretReady} />
      ))}
      <Writing settings={settings} />
    </div>
  );
}

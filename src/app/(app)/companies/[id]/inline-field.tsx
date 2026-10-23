"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type InlineOption = { value: string; label: string };

type Props = {
  companyId: number;
  target: "company" | "property";
  field: string;
  label: string;
  value: string | null;
  // "row" = label above value (left card), "stat" = compact (property profile), "title" = page heading
  variant?: "row" | "stat" | "big" | "title";
  type?: "text" | "email" | "tel" | "number" | "select";
  options?: InlineOption[];
  href?: string | null;
  emptyText?: string;
  className?: string;
};

// Click a value to edit it. Enter or clicking away saves, Esc cancels. Dropdowns save as soon as
// a choice is made. Each field saves on its own through /api/companies/[id]/field.
export function InlineField(props: Props) {
  // Remount when the saved value changes on the server, so the field always shows the latest value.
  return <InlineFieldInner key={props.value ?? ""} {...props} />;
}

function InlineFieldInner({
  companyId,
  target,
  field,
  label,
  value,
  variant = "row",
  type = "text",
  options,
  href,
  emptyText = "—",
  className = "",
}: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? "");
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function save(next: string) {
    if (next.trim() === current.trim()) {
      setEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/field`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, field, value: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't save");
      return; // stay in edit mode so the value isn't lost
    }
    const saved = (await res.json()).value;
    setCurrent(saved === null || saved === undefined ? "" : String(saved));
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setDraft(current);
    setError(null);
    setEditing(false);
  }

  const shown = type === "select" ? (options?.find((o) => o.value === current)?.label ?? current) : current;

  const editor = (
    <div className="space-y-1">
      {type === "select" ? (
        <select
          ref={(el) => {
            inputRef.current = el;
          }}
          value={draft}
          disabled={saving}
          onChange={(e) => {
            setDraft(e.target.value);
            save(e.target.value);
          }}
          onBlur={() => !saving && cancel()}
          onKeyDown={(e) => e.key === "Escape" && cancel()}
          className="w-full rounded-md border border-sky-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
        >
          <option value="">—</option>
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          ref={(el) => {
            inputRef.current = el;
          }}
          type={type}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => !saving && save(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(draft);
            if (e.key === "Escape") cancel();
          }}
          className="w-full rounded-md border border-sky-400 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-sky-200"
        />
      )}
      {saving && <p className="text-xs text-zinc-400">Saving...</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );

  const display = (
    <span className="group/edit relative inline-flex max-w-full items-center">
      {shown && href ? (
        <a href={href} target="_blank" rel="noreferrer" className="truncate underline">
          {shown}
        </a>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title={`Edit ${label.toLowerCase()}`}
          className={`truncate rounded text-left hover:bg-sky-50 ${shown ? "" : "text-zinc-400"}`}
        >
          {shown || emptyText}
        </button>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${label}`}
        className="absolute -right-5 top-1/2 -translate-y-1/2 rounded bg-white p-0.5 text-zinc-400 opacity-0 shadow-sm transition-opacity hover:bg-zinc-100 hover:text-zinc-700 focus:opacity-100 group-hover/edit:opacity-100"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
      </button>
    </span>
  );

  if (variant === "title") {
    return <h1 className={`text-2xl font-semibold leading-tight tracking-tight text-zinc-900 ${className}`}>{editing ? editor : display}</h1>;
  }
  if (variant === "big") {
    return (
      <div className={className}>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
        <div className="mt-0.5 text-xl font-semibold text-zinc-900">{editing ? editor : display}</div>
      </div>
    );
  }
  if (variant === "stat") {
    return (
      <div className={className}>
        <div className="text-xs text-zinc-500">{label}</div>
        <div className="text-sm font-medium text-zinc-900">{editing ? editor : display}</div>
      </div>
    );
  }
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-900">{editing ? editor : display}</dd>
    </div>
  );
}

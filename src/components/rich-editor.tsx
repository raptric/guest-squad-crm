"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { mdToHtml } from "@/lib/rich-text";

const BLOCK = new Set(["DIV", "P", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "BLOCKQUOTE"]);

const isBold = (el: HTMLElement) => {
  if (el.tagName === "B" || el.tagName === "STRONG") return true;
  const w = el.style.fontWeight;
  return w === "bold" || (Boolean(w) && Number(w) >= 600);
};

// The text of a run of inline content, with ** around the bold parts. Spaces at the edges of a bold part stay outside the markers.
function inline(node: Node, inBold: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replaceAll(" ", " ").replaceAll("​", "");
  if (!(node instanceof HTMLElement)) return "";
  if (node.tagName === "BR") return node.nextSibling ? "\n" : ""; // the last <br> of a line is only the browser's placeholder
  const bold = isBold(node);
  const text = [...node.childNodes].map((c) => inline(c, inBold || bold)).join("");
  if (!bold || inBold) return text;
  const core = text.trim();
  if (!core) return text;
  return `${text.slice(0, text.indexOf(core))}**${core}**${text.slice(text.indexOf(core) + core.length)}`;
}

// The text form of what is in the editor: one line per div, "- " for each list item.
export function editorToText(root: HTMLElement): string {
  const lines: string[] = [];
  const walk = (parent: Node) => {
    let buf = "";
    let has = false;
    const flush = () => {
      if (has) buf.split("\n").forEach((l) => lines.push(l));
      buf = "";
      has = false;
    };
    for (const n of parent.childNodes) {
      if (n instanceof HTMLElement && BLOCK.has(n.tagName)) {
        flush();
        if (n.tagName === "UL" || n.tagName === "OL") {
          for (const li of n.children) lines.push(`- ${inline(li, false).replace(/\s*\n\s*/g, " ").trim()}`);
        } else if ([...n.childNodes].some((c) => c instanceof HTMLElement && BLOCK.has(c.tagName))) {
          walk(n);
        } else {
          const t = inline(n, false);
          (t === "" ? [""] : t.split("\n")).forEach((l) => lines.push(l));
        }
      } else {
        buf += inline(n, false);
        has = true;
      }
    }
    flush();
  };
  walk(root);
  return lines.join("\n").replace(/\s+$/, "");
}

const Btn = ({ active, label, onClick, children }: { active: boolean; label: string; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={active}
    // mouse down would take the cursor out of the text, so the click is handled there instead
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    className={`flex h-7 w-7 items-center justify-center rounded text-sm hover:bg-zinc-100 ${active ? "bg-zinc-200 text-zinc-900" : "text-zinc-600"}`}
  >
    {children}
  </button>
);

// A small rich text box: bold and bullets. The value is plain text ("**bold**", "- bullet"), so everything else in the CRM keeps
// working with text.
export function RichEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  minHeight = "12rem",
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel: string;
  minHeight?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ bold: false, list: false });
  const empty = !value.trim();

  // Show a new value that came from outside (a baseline picked, a draft used). What the person types is already on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && editorToText(el) !== value) el.innerHTML = mdToHtml(value);
  }, [value]);

  const read = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const text = editorToText(el);
    if (!text.trim() && el.innerHTML !== "") el.innerHTML = ""; // lets the placeholder show again
    onChange(text);
  }, [onChange]);

  const refresh = useCallback(() => {
    const el = ref.current;
    if (!el || !el.contains(document.getSelection()?.anchorNode ?? null)) return;
    setState({ bold: document.queryCommandState("bold"), list: document.queryCommandState("insertUnorderedList") });
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, [refresh]);

  function run(command: "bold" | "insertUnorderedList") {
    ref.current?.focus();
    document.execCommand(command);
    read();
    refresh();
  }

  return (
    <div className={`rounded-lg border border-zinc-300 bg-white focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-0.5 border-b border-zinc-100 px-1.5 py-1">
        <Btn active={state.bold} label="Bold (Ctrl+B)" onClick={() => run("bold")}>
          <span className="font-bold">B</span>
        </Btn>
        <Btn active={state.list} label="Bullet list" onClick={() => run("insertUnorderedList")}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="3" cy="4" r="1.2" />
            <circle cx="3" cy="8" r="1.2" />
            <circle cx="3" cy="12" r="1.2" />
            <rect x="6" y="3.2" width="8" height="1.6" rx=".8" />
            <rect x="6" y="7.2" width="8" height="1.6" rx=".8" />
            <rect x="6" y="11.2" width="8" height="1.6" rx=".8" />
          </svg>
        </Btn>
        <span className="ml-2 text-xs text-zinc-400">Bold and bullets only, so the email stays simple.</span>
      </div>
      <div className="relative">
        {empty && placeholder && <p className="pointer-events-none absolute left-3 top-2 text-sm text-zinc-400">{placeholder}</p>}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          contentEditable={!disabled}
          suppressContentEditableWarning
          spellCheck
          onInput={read}
          onBlur={read}
          onPaste={(e) => {
            // paste as text, so pasted web pages and Word files bring no fonts or colours
            e.preventDefault();
            const text = e.clipboardData.getData("text/plain").replace(/\r\n/g, "\n");
            if (!text.includes("\n") && !text.startsWith("- ")) document.execCommand("insertText", false, text);
            else document.execCommand("insertHTML", false, mdToHtml(text));
            read();
          }}
          style={{ minHeight }}
          className="whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-zinc-900 outline-none [&_b]:font-semibold [&_ul]:my-0 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>
    </div>
  );
}

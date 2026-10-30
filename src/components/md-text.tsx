import { layoutLines, plainSegments, type Seg } from "@/lib/rich-text";

// Text written with **bold** and "- " bullets, shown with the formatting applied. Pass segments to highlight the words that changed.
export function MdText({ text, segments, className = "" }: { text?: string; segments?: Seg[]; className?: string }) {
  const lines = layoutLines(segments ?? plainSegments(text ?? ""));
  return (
    <div className={className}>
      {lines.map((line, i) => {
        const content = line.pieces.map((p, k) => {
          const inner = p.bold ? <strong key={k}>{p.text}</strong> : <span key={k}>{p.text}</span>;
          return p.changed ? (
            <mark key={k} className="rounded bg-emerald-100 px-0.5 text-zinc-900">
              {inner}
            </mark>
          ) : (
            inner
          );
        });
        if (line.bullet) {
          return (
            <div key={i} className="flex gap-2 pl-2 whitespace-pre-wrap">
              <span aria-hidden>•</span>
              <span className="min-w-0 flex-1">{content}</span>
            </div>
          );
        }
        return (
          <div key={i} className="whitespace-pre-wrap">
            {content.length ? content : <br />}
          </div>
        );
      })}
    </div>
  );
}

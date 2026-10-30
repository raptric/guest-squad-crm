// Emails and signatures are written with a little formatting: **bold** and lines that start with "- " (bullets). They are stored and
// sent to the AI as that plain text, shown with the formatting applied, and turned into HTML only when the email goes out.
// No DOM here, so it is safe on the server and in the browser.

const escapeHtml = (t: string) => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const BOLD = /\*\*(.+?)\*\*/g;
const BULLET = /^- /;

const inlineHtml = (line: string) => escapeHtml(line).replace(BOLD, "<b>$1</b>");

// The HTML for the text: a div per line, an empty line as <div><br></div>, and a run of bullet lines as one list. This is the shape
// the editor shows and the shape an email client expects, and it is the same either way.
export function mdToHtml(md: string, listStyle = ""): string {
  const out: string[] = [];
  let list: string[] = [];
  const closeList = () => {
    if (list.length) out.push(`<ul${listStyle ? ` style="${listStyle}"` : ""}>${list.join("")}</ul>`);
    list = [];
  };
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    if (BULLET.test(line)) {
      list.push(`<li>${inlineHtml(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    out.push(line.trim() ? `<div>${inlineHtml(line)}</div>` : "<div><br></div>");
  }
  closeList();
  return out.join("");
}

// The HTML of a sent email.
export const emailHtml = (md: string) => mdToHtml(md, "margin:0;padding-left:20px");

// The text version of an email: no bold markers, bullets kept as "- ".
export const mdToPlain = (md: string) => md.replace(BOLD, "$1");

export type Seg = { text: string; changed: boolean };
export const plainSegments = (text: string): Seg[] => text.split(/(\s+)/).filter(Boolean).map((t) => ({ text: t, changed: false }));

export type Piece = { text: string; changed: boolean; bold: boolean };
export type Line = { bullet: boolean; pieces: Piece[] };

// Lay out words (with or without "changed" marks) as lines: bold runs from ** pairs, bullets from a leading "- ".
export function layoutLines(segments: Seg[]): Line[] {
  const lines: Piece[][] = [[]];
  let bold = false;
  for (const seg of segments) {
    seg.text.split("\n").forEach((part, i) => {
      if (i > 0) lines.push([]);
      part.split("**").forEach((bit, j) => {
        if (j > 0) bold = !bold;
        if (bit) lines[lines.length - 1].push({ text: bit, changed: seg.changed, bold });
      });
    });
  }
  return lines.map((pieces) => {
    const joined = pieces.map((p) => p.text).join("");
    if (!BULLET.test(joined)) return { bullet: false, pieces };
    let drop = 2;
    const rest: Piece[] = [];
    for (const p of pieces) {
      if (drop >= p.text.length) {
        drop -= p.text.length;
        continue;
      }
      rest.push({ ...p, text: p.text.slice(drop) });
      drop = 0;
    }
    return { bullet: true, pieces: rest };
  });
}

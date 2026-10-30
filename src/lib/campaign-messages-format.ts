// Emails on campaign tasks: the data a task needs to show its baseline, and the small pure helpers. Safe to import from the browser.

export const EMAIL_CHANNELS = ["Initial Email", "Follow-up Email"];
export const isEmailChannel = (channel: string) => EMAIL_CHANNELS.includes(channel);

export type MessageSource = "baseline" | "ai" | "edited" | "human";

// What an email task needs: the campaign's baseline (read live), the values that fill its placeholders, who it goes to, and,
// once the task is done, the email that was sent.
// An email the AI wrote for this company and that has not been sent.
export type MailDraft = { id: string; subject: string; body: string; facts_used: string[]; notes: string; at: string };

export type TaskMail = {
  baseline_subject: string;
  baseline_body: string;
  first_name: string;
  company_name: string;
  city: string;
  to_email: string;
  sent: { subject: string; body: string; signature: string; at: string | null; by: string | null; source: MessageSource } | null;
  drafts: MailDraft[];
};

export type FillValues = { first_name: string; company_name: string; city: string; sender_name: string };

// A missing first name becomes "there", so "Hi {first_name}," reads "Hi there,".
export function fillPlaceholders(text: string, v: FillValues): string {
  return text
    .replaceAll("{first_name}", v.first_name.trim() || "there")
    .replaceAll("{company_name}", v.company_name.trim() || "{company_name}")
    .replaceAll("{city}", v.city.trim() || "{city}")
    .replaceAll("{sender_name}", v.sender_name.trim() || "{sender_name}");
}

// Placeholders still in the text, which would go out as they are: {names} and {{codes}}. {{sender.signature}} is not one, because
// it is filled in with the signature when the email is sent.
export function leftoverPlaceholders(text: string): string[] {
  const codes = [...text.matchAll(/\{\{[^{}\n]*\}\}/g)].map((m) => m[0]).filter((c) => !/^\{\{\s*sender\.signature\s*\}\}$/.test(c));
  const rest = text.replace(/\{\{[^{}\n]*\}\}/g, " ");
  return [...new Set([...codes, ...[...rest.matchAll(/\{[A-Za-z_][A-Za-z0-9_]*\}/g)].map((m) => m[0])])];
}

// How the text that was sent came about, judged against the baseline it started from (if it did).
export function messageSource(sent: { subject: string; body: string }, started: { origin: "baseline" | "ai" | "human"; subject: string; body: string } | null): MessageSource {
  if (!started || started.origin === "human") return "human";
  const same = sent.subject.trim() === started.subject.trim() && sent.body.trim() === started.body.trim();
  return same ? started.origin : "edited";
}

// The words of "after" that are not in "before", for highlighting what an email changed. Whitespace is kept as it is.
export function diffWords(before: string, after: string): { text: string; changed: boolean }[] {
  const tokens = (t: string) => t.split(/(\s+)/).filter((x) => x !== "");
  const a = tokens(before).filter((x) => !/^\s+$/.test(x));
  const b = tokens(after);
  const words = b.map((x, i) => ({ x, i })).filter((w) => !/^\s+$/.test(w.x));
  // longest common subsequence of the words
  const n = a.length;
  const m = words.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = a[i] === words[j].x ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const kept = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === words[j].x) {
      kept.add(words[j].i);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return b.map((x, i) => ({ text: x, changed: !/^\s+$/.test(x) && !kept.has(i) }));
}

// Emails on campaign tasks: the data a task needs to show its baseline, and the small pure helpers. Safe to import from the browser.

export const EMAIL_CHANNELS = ["Initial Email", "Follow-up Email"];
export const isEmailChannel = (channel: string) => EMAIL_CHANNELS.includes(channel);

export type MessageSource = "baseline" | "ai" | "edited" | "human";

// What an email task needs: the campaign's baseline (read live), the values that fill its placeholders, who it goes to, and,
// once the task is done, the email that was sent.
export type TaskMail = {
  baseline_subject: string;
  baseline_body: string;
  first_name: string;
  company_name: string;
  city: string;
  to_email: string;
  sent: { subject: string; body: string; at: string | null; by: string | null; source: MessageSource } | null;
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

// Placeholders still in the text, which would go out as they are.
export function leftoverPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{[A-Za-z_][A-Za-z0-9_]*\}/g)].map((m) => m[0]))];
}

// How the text that was sent came about, judged against the baseline it started from (if it did).
export function messageSource(sent: { subject: string; body: string }, started: { origin: "baseline" | "human"; subject: string; body: string } | null): MessageSource {
  if (!started || started.origin !== "baseline") return "human";
  return sent.subject.trim() === started.subject.trim() && sent.body.trim() === started.body.trim() ? "baseline" : "edited";
}

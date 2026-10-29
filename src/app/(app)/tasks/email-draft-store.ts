// The email being prepared for each task on the page. It lives in the browser only, so the email box on a task and the Done
// button of the same task can share it. Nothing here is saved until the task is marked done.
export type EmailDraft = {
  subject: string;
  body: string;
  // where it started: the campaign's baseline (filled in), or written from nothing. The text it started with is kept so the
  // CRM can tell later whether it was changed.
  origin: "baseline" | "ai" | "human";
  startedSubject: string;
  startedBody: string;
};

const drafts = new Map<string, EmailDraft>();

export const getEmailDraft = (taskId: string) => drafts.get(taskId) ?? null;
export const setEmailDraft = (taskId: string, draft: EmailDraft | null) => {
  if (draft) drafts.set(taskId, draft);
  else drafts.delete(taskId);
};

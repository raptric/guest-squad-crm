import nodemailer from "nodemailer";

// Sending from a person's own Gmail (or Google Workspace) inbox with an app password, over SMTP. Server only.
// Gmail keeps a copy of everything sent this way in the person's Sent folder.

export class MailError extends Error {}

// Gmail's own server. The MAIL_SMTP_* variables exist only so the sending can be tried against a local stand-in.
const HOST = process.env.MAIL_SMTP_HOST || "smtp.gmail.com";
const PORT = Number(process.env.MAIL_SMTP_PORT) || 465;
const SECURE = process.env.MAIL_SMTP_SECURE !== "false";

export const MAIL_PURPOSE = "mail";

// Google shows an app password in four groups with spaces. The spaces are not part of it.
export const cleanPassword = (p: string) => p.replace(/\s+/g, "");
export const looksLikeEmail = (a: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) && a.length <= 255;

function friendly(e: unknown): MailError {
  const err = e as { code?: string; responseCode?: number; response?: string };
  if (err?.code === "EAUTH" || err?.responseCode === 535) {
    return new MailError("Gmail did not accept that address and app password. Check that the app password is copied in full, that it belongs to this Gmail address, and that 2-step verification is on.");
  }
  if (err?.code === "ETIMEDOUT" || err?.code === "ECONNECTION" || err?.code === "ESOCKET" || err?.code === "EDNS") {
    return new MailError("Couldn't reach Gmail. Try again in a moment.");
  }
  if (err?.code === "EENVELOPE" || (err?.responseCode && err.responseCode >= 550 && err.responseCode < 560)) {
    return new MailError("Gmail refused the recipient address. Check that it is a real address.");
  }
  if (err?.responseCode === 421 || err?.responseCode === 450 || err?.responseCode === 452 || err?.responseCode === 454) {
    return new MailError("Gmail asked us to slow down. Try again in a few minutes.");
  }
  return new MailError("The email could not be sent. Try again.");
}

const transport = (address: string, password: string) =>
  nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: SECURE,
    ...(SECURE ? {} : { ignoreTLS: true }),
    auth: { user: address, pass: cleanPassword(password) },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

// Logs in without sending anything, to prove the address and app password work.
export async function verifyAccount(address: string, password: string): Promise<void> {
  try {
    await transport(address, password).verify();
  } catch (e) {
    throw friendly(e);
  }
}

export type SendInput = { fromName: string; fromAddress: string; password: string; to: string; subject: string; text: string; html?: string };

export async function sendMail(m: SendInput): Promise<{ messageId: string }> {
  try {
    const info = await transport(m.fromAddress, m.password).sendMail({
      from: { name: m.fromName, address: m.fromAddress },
      to: m.to,
      subject: m.subject,
      text: m.text,
      ...(m.html ? { html: m.html } : {}),
    });
    return { messageId: String(info.messageId ?? "") };
  } catch (e) {
    throw friendly(e);
  }
}

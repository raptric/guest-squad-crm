// One-off seed for Settings -> AI: the starting writing rules text, a starter "never claim" list and a few illustrative
// examples (see docs/ai-copy-rules-draft.md). Safe to run again: it only fills what is still empty.
// Usage: node scripts/seed-ai-content.mjs
import { Client } from "pg";
import { config } from "dotenv";
import { DEFAULT_RULES_TEXT } from "../src/lib/ai/rules-format.ts";

config({ path: ".env.local" });

const NEVER_CLAIM = [
  "No pricing, discounts or savings numbers unless they are written under Proof points.",
  'No guarantees ("guaranteed", "100%").',
  "No claims about the prospect's reviews, staff or performance that are not in the CRM data.",
  "No naming of other customers unless approved.",
  "No negative comments about competitors.",
].join("\n");

const NOTE = "Illustrative sample from the first draft. Replace it with one of your real best messages.";
const EXAMPLES = [
  {
    role: "initial_email",
    subject: "after-hours messages",
    body: "Hi {first_name},\n\nGuests at {property_name} who write after midnight probably wait until morning for a reply. That is when a lot of arrival questions and last-minute bookings come in.\n\nWe cover guest messages and calls for hotels overnight, so nothing sits unanswered.\n\nWorth a quick chat?",
  },
  {
    role: "followup_email",
    subject: "late arrivals",
    body: "{first_name}, one more thought. Late check-ins are where small delays turn into bad reviews. A reply within minutes at 1 a.m. changes how the stay starts.\n\nWould it help to see how other hotels handle it?",
  },
  {
    role: "followup_email",
    subject: "closing the loop",
    body: "{first_name}, I'll stop here so I don't clutter your inbox. If overnight guest coverage ever becomes a priority at {property_name}, I'm happy to help.",
  },
  { role: "linkedin_connect", subject: "", body: "Hi {first_name}, I work with hotels on guest communication and your property in {city} caught my eye. Glad to connect." },
  {
    role: "call",
    subject: "",
    body: "Hi {first_name}, it's {sender_name} from GuestSquad. I'll be brief: we help hotels answer guest calls and messages after hours. Is that something {property_name} handles in-house today?",
  },
];

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
try {
  await pg.query("BEGIN");
  const version = (kind, ref, snapshot) => pg.query("INSERT INTO ai_versions (kind, ref, snapshot, changed_by) VALUES ($1,$2,$3,NULL)", [kind, ref, JSON.stringify(snapshot)]);

  if (!(await pg.query("SELECT 1 FROM ai_rules WHERE id = 1")).rowCount) {
    await pg.query("INSERT INTO ai_rules (id, data) VALUES (1, $1)", [JSON.stringify({ text: DEFAULT_RULES_TEXT })]);
    await version("rules", "rules", { data: { text: DEFAULT_RULES_TEXT } });
    console.log("rules seeded");
  }
  if (!(await pg.query("SELECT 1 FROM ai_knowledge WHERE key = 'never_claim'")).rowCount) {
    await pg.query("INSERT INTO ai_knowledge (key, body) VALUES ('never_claim', $1)", [NEVER_CLAIM]);
    await version("knowledge", "never_claim", { body: NEVER_CLAIM });
    console.log("never_claim seeded");
  }
  if (!(await pg.query("SELECT 1 FROM ai_examples")).rowCount) {
    for (const e of EXAMPLES) {
      const { rows } = await pg.query("INSERT INTO ai_examples (role, audience, subject, body, kind, note) VALUES ($1,'any',$2,$3,'good',$4) RETURNING id::text", [e.role, e.subject, e.body, NOTE]);
      await version("example", rows[0].id, { role: e.role, audience: "any", subject: e.subject, body: e.body, kind: "good", note: NOTE, is_active: true });
    }
    console.log(`${EXAMPLES.length} examples seeded`);
  }
  await pg.query("COMMIT");
} catch (e) {
  await pg.query("ROLLBACK");
  throw e;
} finally {
  await pg.end();
}

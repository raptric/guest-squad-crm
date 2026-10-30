import { query } from "@/lib/db";

// The master switch for AI writing, set in Settings -> AI. Off means no Generate with AI / Write for this company anywhere.
export async function fetchAiWritingEnabled(): Promise<boolean> {
  const [row] = await query<{ writing_enabled: boolean }>("SELECT writing_enabled FROM ai_settings WHERE id = 1");
  return row?.writing_enabled ?? false;
}

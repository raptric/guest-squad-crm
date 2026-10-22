import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/current-user";
import { getAppOrigin } from "@/lib/app-url";
import { parseProfileInput } from "@/lib/profile-fields";

// "Block" uses Supabase's native auth ban rather than a column of our own: a banned user can't
// sign in, an already-logged-in session is rejected on its very next request (the app validates
// with auth.getUser() each time), and refresh tokens stop working. Effectively permanent until
// someone unblocks them.
const BAN_FOREVER = "876000h";

type Action = "resend_invite" | "reset_password" | "block" | "unblock";
const ACTIONS: Action[] = ["resend_invite", "reset_password", "block", "unblock"];

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// Admin edit of a user's basic profile (name, phone, job title) and role. Email is not editable.
// An admin can't change their own role (so the last admin can't lock themselves out).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Forbidden", 403);

  const body = await request.json();
  const parsed = parseProfileInput(body);
  if ("error" in parsed) return fail(parsed.error, 400);

  const { id } = await params;
  const role = (body as { role?: unknown }).role;
  if (role !== undefined && role !== "super_admin" && role !== "user") {
    return fail("role must be 'super_admin' or 'user'", 400);
  }
  if (role !== undefined && Number(id) === Number(actor.id) && role !== actor.role) {
    return fail("You can't change your own role.", 400);
  }

  const { data, error } = await createAdminClient()
    .from("users")
    .update(role === undefined ? parsed.value : { ...parsed.value, role })
    .eq("id", id)
    .select("id, name, email, role, phone, job_title")
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return fail("User not found", 404);

  return NextResponse.json({ user: data });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "super_admin") return fail("Forbidden", 403);

  const { id } = await params;
  const { action } = (await request.json()) as { action?: Action };
  if (!action || !ACTIONS.includes(action)) return fail(`action must be one of: ${ACTIONS.join(", ")}`, 400);

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("users")
    .select("id, name, email, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!target?.auth_user_id) return fail("User not found", 404);

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.getUserById(target.auth_user_id);
  if (authError || !authData.user) return fail(authError?.message ?? "Auth account not found", 404);
  const authUser = authData.user;
  const accepted = Boolean(authUser.email_confirmed_at);
  const redirectTo = `${await getAppOrigin()}/reset-password`;

  if (action === "block" || action === "unblock") {
    if (action === "block" && Number(target.id) === Number(actor.id)) {
      return fail("You can't block your own account.", 400);
    }
    const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, {
      ban_duration: action === "block" ? BAN_FOREVER : "none",
    });
    if (error) return fail(error.message, 500);
    return NextResponse.json({ ok: true, message: action === "block" ? `${target.name} is blocked.` : `${target.name} can sign in again.` });
  }

  if (authUser.banned_until && new Date(authUser.banned_until) > new Date()) {
    return fail("This user is blocked. Unblock them first.", 400);
  }

  if (action === "resend_invite") {
    if (accepted) return fail("This user has already accepted their invite. Send a password reset instead.", 400);
    const { error } = await admin.auth.admin.inviteUserByEmail(target.email, { redirectTo });
    if (error) return fail(error.message, 400);
    return NextResponse.json({ ok: true, message: `Invite re-sent to ${target.email}.` });
  }

  // reset_password -- identical to the self-service "Forgot password?" flow.
  if (!accepted) return fail("This user hasn't accepted their invite yet. Re-send the invite instead.", 400);
  const { error } = await admin.auth.resetPasswordForEmail(target.email, { redirectTo });
  if (error) return fail(error.message, 400);
  return NextResponse.json({ ok: true, message: `Password reset link sent to ${target.email}.` });
}

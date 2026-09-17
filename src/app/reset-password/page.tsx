"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function checkPasswordStrength(password: string) {
  const checks = [
    { label: "At least 8 characters", pass: password.length >= 8 },
    { label: "One uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "One lowercase letter", pass: /[a-z]/.test(password) },
    { label: "One number", pass: /[0-9]/.test(password) },
    { label: "One special character", pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter((c) => c.pass).length;
  return { checks, score, isStrong: score === checks.length };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [invalidLink, setInvalidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Supabase redirects back here with ?error=... (or a #error=... hash) when the
    // recovery/invite link itself was invalid or expired -- check this first, before ever
    // looking at auth state, so an expired link can't fall through to "ready" just because
    // the browser happens to already hold an unrelated, older session.
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (searchParams.get("error") || hashParams.get("error")) {
      setInvalidLink(true);
      return;
    }

    const supabase = createClient();

    // A valid link establishes a fresh session client-side once Supabase processes the URL.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });

    const timeout = setTimeout(() => {
      setReady((current) => {
        if (!current) setInvalidLink(true);
        return current;
      });
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const strength = checkPasswordStrength(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!strength.isStrong) {
      setError("Password does not meet the strength requirements below.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1500);
  }

  if (invalidLink) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-zinc-900">Link expired</h1>
          <p className="text-sm text-zinc-600">
            This reset/invite link is invalid or has expired. Request a new one.
          </p>
          <a href="/forgot-password" className="text-sm font-medium text-zinc-900 underline">
            Request a new link
          </a>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Verifying link...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-xl font-semibold text-zinc-900">Set your password</h1>

        {success ? (
          <p className="text-sm text-green-600">Password updated. Redirecting...</p>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium text-zinc-700">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <ul className="space-y-0.5 text-xs">
              {strength.checks.map((check) => (
                <li
                  key={check.label}
                  className={check.pass ? "text-green-600" : "text-zinc-400"}
                >
                  {check.pass ? "✓" : "○"} {check.label}
                </li>
              ))}
            </ul>

            <div className="space-y-1">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-zinc-700">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Set password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

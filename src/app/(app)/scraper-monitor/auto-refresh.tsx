"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the server page on an interval so the screen can be left open.
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return <span className="text-xs text-zinc-400">Auto-refreshes every {seconds}s</span>;
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import type { SyncStatusResponse } from "@/types";

const POLL_INTERVAL_MS = 5000;

export function SyncBanner({
  status: initialStatus,
  count: initialCount,
  total: initialTotal,
}: {
  status: "pending" | "in_progress" | "complete" | "failed";
  count: number;
  total: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<SyncStatusResponse>({
    status: initialStatus,
    count: initialCount,
    total: initialTotal,
    lastSyncAt: null,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    let lastStatus: string | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    async function poll() {
      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as SyncStatusResponse;
        if (cancelled) return;
        setState(data);
        if (data.status === "complete" && lastStatus && lastStatus !== "complete") {
          router.refresh();
        }
        if (data.status === "complete" && interval) {
          clearInterval(interval);
          interval = null;
        }
        lastStatus = data.status;
      } catch {
        // ignore — will retry on next interval
      }
    }
    poll();
    interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissed]);

  if (dismissed) return null;
  if (state.status === "complete") return null;

  const safeTotal = state.total > 0 ? state.total : Math.max(state.count, 1);
  const pct = Math.min(100, Math.round((state.count / safeTotal) * 100));

  return (
    <div className="border-b bg-[#fef7e0] px-4 py-2 text-xs text-[#5f3e00]">
      <div className="flex items-center gap-3">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="font-medium">
          {state.status === "in_progress"
            ? `Syncing your full mailbox… ${state.count.toLocaleString()} of ~${safeTotal.toLocaleString()} (${pct}%)`
            : state.status === "failed"
              ? "Sync failed."
              : "Sync pending."}
        </span>
        <Link href="/sync" className="ml-auto underline">
          Open sync settings
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss banner"
          className="rounded-full p-1 hover:bg-[#fde8b5]"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[#fde8b5]">
        <div className="h-full bg-[#fbbc04] transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

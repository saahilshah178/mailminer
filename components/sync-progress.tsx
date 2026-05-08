"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SyncStatusResponse } from "@/types";

const POLL_INTERVAL_MS = 5000;
const MIN_USABLE_COUNT = 1000;

export interface SyncProgressProps {
  /** When true, don't auto-redirect to /inbox once status flips to complete. */
  stayOnComplete?: boolean;
}

export function SyncProgress({ stayOnComplete }: SyncProgressProps = {}) {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/sync", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch sync status");
        const data = (await res.json()) as SyncStatusResponse;
        if (!cancelled) setStatus(data);
        if (data.status === "complete" && !stayOnComplete) {
          router.replace("/inbox");
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [router, stayOnComplete]);

  async function startSync() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) {
        // Surface the server's actual error so the user sees *why* the
        // sync didn't start (e.g. Inngest worker unreachable) instead
        // of a generic "Failed to start sync".
        let serverMessage = "Failed to start sync";
        try {
          const body = (await res.json()) as { error?: string; detail?: string };
          if (body?.error) serverMessage = body.error;
        } catch {
          // ignore: response wasn't JSON
        }
        throw new Error(serverMessage);
      }
      // Optimistically reflect the kicked-off state.
      setStatus((prev) =>
        prev
          ? { ...prev, status: "in_progress" }
          : { status: "in_progress", count: 0, total: 0, lastSyncAt: null },
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  if (!status) {
    return <p className="text-sm text-muted-foreground">Loading sync status…</p>;
  }

  const total = status.total > 0 ? status.total : Math.max(status.count, 1);
  const pct = Math.min(100, Math.round((status.count / total) * 100));
  const canTry = status.count >= MIN_USABLE_COUNT;
  const isWorking = status.status === "in_progress" || status.status === "pending";
  const isComplete = status.status === "complete";

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium text-[#202124]">
            {status.status === "complete"
              ? "Sync complete"
              : status.status === "in_progress"
                ? "Syncing your inbox…"
                : status.status === "failed"
                  ? "Sync failed"
                  : "Preparing sync"}
          </span>
          <span className="text-[#5f6368]">
            {status.count.toLocaleString()}
            {status.total > 0 && status.status !== "complete" && ` of ~${status.total.toLocaleString()}`}
            {status.status === "complete" && " emails indexed"}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e8eaed]">
          <div
            className="h-full bg-[#0b57d0] transition-all"
            style={{ width: isComplete ? "100%" : `${pct}%` }}
            aria-valuenow={pct}
            role="progressbar"
          />
        </div>
        {isWorking && (
          <p className="mt-2 text-xs text-[#5f6368]">
            We&apos;re fetching every message in your Gmail account, including Sent, Spam,
            and Trash. You can keep using the inbox while we work — newly indexed messages
            appear here automatically.
          </p>
        )}
      </div>

      {status.status === "pending" && (
        <Button onClick={startSync} disabled={starting}>
          {starting ? "Starting…" : "Start sync"}
        </Button>
      )}

      {status.status === "failed" && (
        <Button onClick={startSync} disabled={starting} variant="outline">
          {starting ? "Retrying…" : "Retry sync"}
        </Button>
      )}

      {isComplete && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inbox">
            <Button>Open inbox</Button>
          </Link>
          <Button onClick={startSync} disabled={starting} variant="outline">
            {starting ? "Restarting…" : "Resync entire inbox"}
          </Button>
          <span className="text-xs text-[#5f6368]">
            Re-runs the full backfill and adds anything we missed.
          </span>
        </div>
      )}

      {canTry && isWorking && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/inbox">
            <Button variant="secondary">Open inbox now</Button>
          </Link>
          <Button onClick={startSync} disabled={starting} variant="outline">
            {starting ? "Restarting…" : "Restart sync"}
          </Button>
          <span className="text-xs text-[#5f6368]">
            Use this if sync looks stuck — kicks off a fresh backfill.
          </span>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

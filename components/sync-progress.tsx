"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { SyncStatusResponse } from "@/types";

const POLL_INTERVAL_MS = 5000;
const MIN_USABLE_COUNT = 1000;

export function SyncProgress() {
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
        if (data.status === "complete") {
          router.replace("/search");
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
  }, [router]);

  async function startSync() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) throw new Error("Failed to start sync");
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

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">
            {status.status === "complete"
              ? "Sync complete"
              : status.status === "in_progress"
                ? "Syncing your inbox…"
                : status.status === "failed"
                  ? "Sync failed"
                  : "Preparing sync"}
          </span>
          <span className="text-muted-foreground">
            {status.count.toLocaleString()}
            {status.total > 0 && ` of ~${status.total.toLocaleString()}`}
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
            aria-valuenow={pct}
            role="progressbar"
          />
        </div>
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

      {canTry && status.status !== "complete" && (
        <Link href="/search">
          <Button variant="secondary">Try a query now</Button>
        </Link>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

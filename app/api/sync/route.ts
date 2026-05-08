import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inngest } from "@/inngest/client";
import { getUserById, setSyncStatus } from "@/lib/db/users";
import { getEmailCountForUser } from "@/lib/db/emails";
import type { SyncStatusResponse } from "@/types";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  try {
    const user = await getUserById(userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    // Allow a manual resync even when the previous run is stuck on
    // `in_progress` (e.g. the dev process was killed mid-backfill before
    // it could mark itself complete). Inngest dedupes via per-user
    // concurrency, and `bulkUpsertEmails` is idempotent.
    await setSyncStatus(userId, "in_progress", { count: 0, total: 0 });
    try {
      await inngest.send({
        name: "app/sync.requested",
        data: { userId, mode: "initial" },
      });
    } catch (err) {
      // Inngest is unreachable (e.g. dev server isn't running, or the
      // event key is invalid in prod). Roll the status back so the UI
      // doesn't hang on "in_progress" forever, and surface a clear,
      // actionable error to the client instead of returning ok.
      const detail = (err as Error).message;
      console.error("sync.requested.send_failed", { userId, error: detail });
      try {
        await setSyncStatus(userId, "failed");
      } catch (rollbackErr) {
        console.error("sync.requested.rollback_failed", {
          userId,
          error: (rollbackErr as Error).message,
        });
      }
      return NextResponse.json(
        {
          error:
            "Could not enqueue sync: the background worker is unreachable. Make sure the Inngest dev server is running (`npx inngest-cli@latest dev`) and try again.",
          detail,
        },
        { status: 503 },
      );
    }
    console.info("sync.requested", { userId, sendOk: true });
    return NextResponse.json({ ok: true, status: "in_progress" });
  } catch (err) {
    console.error("POST /api/sync failed", { userId, error: (err as Error).message });
    return NextResponse.json({ error: "Failed to start sync" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  try {
    const user = await getUserById(userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const count = await getEmailCountForUser(userId);
    const body: SyncStatusResponse = {
      status: user.sync_status,
      count,
      total: Math.max(user.sync_progress_total ?? 0, count),
      lastSyncAt: user.last_sync_at,
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("GET /api/sync failed", { userId, error: (err as Error).message });
    return NextResponse.json({ error: "Failed to fetch sync status" }, { status: 500 });
  }
}

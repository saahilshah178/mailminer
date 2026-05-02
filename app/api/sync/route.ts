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
    if (user.sync_status === "in_progress") {
      return NextResponse.json({ ok: true, status: "in_progress" });
    }
    // Mark in_progress immediately so the UI flips off "complete" and the
    // sidebar's banner appears. The Inngest function is the source of truth
    // and will keep it in_progress as it pages.
    await setSyncStatus(userId, "in_progress", { count: 0, total: 0 });
    await inngest.send({
      name: "app/sync.requested",
      data: { userId, mode: "initial" },
    });
    console.info("sync.requested", { userId });
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

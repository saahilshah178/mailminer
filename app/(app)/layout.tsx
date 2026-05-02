import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { GmailLayoutShell } from "@/components/gmail/layout-shell";
import { GmailSignOutSlot } from "@/components/gmail/sign-out-slot";
import { buildLabelCountMap, getThreadLabelCounts } from "@/lib/db/inbox";
import { getUserById, setSyncStatus } from "@/lib/db/users";
import { inngest } from "@/inngest/client";

/**
 * One-time marker. Any user whose `last_sync_at` predates this timestamp had
 * their backfill capped by the old 2-year + INBOX-only sync logic. The first
 * time they load the app after this date we silently kick a fresh full
 * mailbox sync. Once that sync finishes, `last_sync_at` advances past this
 * marker and we never auto-trigger again.
 */
const FULL_BACKFILL_RELEASED_AT = new Date("2026-05-02T18:00:00Z");

async function maybeAutoBackfill(
  userId: string,
  syncStatus: string,
  lastSyncAt: string | null,
): Promise<void> {
  if (syncStatus !== "complete") return;
  if (lastSyncAt && new Date(lastSyncAt) >= FULL_BACKFILL_RELEASED_AT) return;
  try {
    await setSyncStatus(userId, "in_progress", { count: 0, total: 0 });
    await inngest.send({
      name: "app/sync.requested",
      data: { userId, mode: "full-backfill" },
    });
    console.info("sync.requested.full-backfill", { userId });
  } catch (err) {
    console.error("auto full-backfill failed", { userId, error: (err as Error).message });
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const userId = session.user.id;
  const [user, counts] = await Promise.all([
    getUserById(userId),
    getThreadLabelCounts(userId).catch(() => []),
  ]);

  if (user) {
    await maybeAutoBackfill(userId, user.sync_status, user.last_sync_at);
  }

  const countMap = buildLabelCountMap(counts);

  return (
    <GmailLayoutShell
      user={{
        email: session.user.email ?? "",
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      }}
      labelCounts={countMap}
      syncStatus={user?.sync_status ?? "pending"}
      signOutSlot={<GmailSignOutSlot />}
    >
      {children}
    </GmailLayoutShell>
  );
}

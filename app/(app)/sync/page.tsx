import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SyncProgress } from "@/components/sync-progress";
import { getEmailCountForUser } from "@/lib/db/emails";
import { getUserById, setSyncStatus } from "@/lib/db/users";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const user = await getUserById(userId);
  if (!user) redirect("/");

  if (user.sync_status === "pending") {
    try {
      await setSyncStatus(userId, "in_progress", { count: 0, total: 0 });
      await inngest.send({
        name: "app/sync.requested",
        data: { userId, mode: "initial" },
      });
      console.info("sync.requested.auto", { userId });
    } catch (err) {
      console.error("auto-start sync failed", { userId, error: (err as Error).message });
    }
  }

  const stored = await getEmailCountForUser(userId).catch(() => 0);

  return (
    <div className="mx-auto w-full max-w-2xl overflow-y-auto px-6 py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">
          Inbox sync
        </h1>
        <p className="text-sm text-[#5f6368]">
          Inbox AI keeps a local copy of your Gmail messages so the inbox renders
          instantly and AI search can run over everything. We pull every message,
          including Sent, Spam, and Trash, with no time limit.
        </p>
        {stored > 0 && (
          <p className="text-xs text-[#5f6368]">
            Currently indexed: <span className="font-medium text-[#202124]">{stored.toLocaleString()}</span> messages.
          </p>
        )}
      </div>
      <div className="mt-6">
        <SyncProgress stayOnComplete />
      </div>
    </div>
  );
}

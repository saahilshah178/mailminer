import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SyncProgress } from "@/components/sync-progress";
import { getUserById, setSyncStatus } from "@/lib/db/users";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const user = await getUserById(userId);
  if (!user) redirect("/");

  // Auto-kick the initial sync the first time the user lands here.
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

  if (user.sync_status === "complete") {
    redirect("/search");
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Setting up your inbox</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;re processing your emails. You can start using the app once at least 1,000 are
          indexed.
        </p>
      </div>
      <SyncProgress />
    </div>
  );
}

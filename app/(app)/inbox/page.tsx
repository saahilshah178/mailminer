import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ThreadList } from "@/components/gmail/thread-list";
import { listThreadsForLabel, getThreadLabelCounts } from "@/lib/db/inbox";
import { DEFAULT_INBOX_VIEW } from "@/lib/inbox-labels";
import { getUserById } from "@/lib/db/users";
import { SyncBanner } from "@/components/gmail/sync-banner";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  p?: string;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const user = await getUserById(userId);
  if (!user) redirect("/");
  if (user.sync_status === "pending" || user.sync_status === "failed") {
    redirect("/sync");
  }

  const page = Math.max(0, parseInt(searchParams.p ?? "0", 10) || 0);
  const view = DEFAULT_INBOX_VIEW;

  const [threads, counts] = await Promise.all([
    listThreadsForLabel(userId, {
      label: view.gmailLabel,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    getThreadLabelCounts(userId).catch(() => []),
  ]);

  const total = counts.find((c) => c.label === (view.gmailLabel ?? ""))?.total_count;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SyncBanner status={user.sync_status} count={user.sync_progress_count} total={user.sync_progress_total} />
      <ThreadList
        threads={threads}
        page={page}
        pageSize={PAGE_SIZE}
        approxTotal={total}
        basePath="/inbox"
        emptyTitle={`${view.title} is empty`}
        emptyHint={view.emptyHint}
      />
    </div>
  );
}

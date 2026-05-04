import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ThreadList } from "@/components/gmail/thread-list";
import { InboxTabs } from "@/components/gmail/inbox-tabs";
import { getInboxTabCounts, listThreadsForTab } from "@/lib/db/inbox";
import { type InboxTab } from "@/lib/inbox-labels";
import { getUserById } from "@/lib/db/users";
import { SyncBanner } from "@/components/gmail/sync-banner";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  p?: string;
  tab?: string;
}

function parseTab(raw: string | undefined): InboxTab {
  return raw === "other" ? "other" : "primary";
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
  const tab = parseTab(searchParams.tab);

  const [initialThreads, tabCounts] = await Promise.all([
    listThreadsForTab(userId, tab, {
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    getInboxTabCounts(userId).catch(() => ({
      primary_total: 0,
      primary_unread: 0,
      other_total: 0,
      other_unread: 0,
    })),
  ]);

  const basePath = tab === "other" ? "/inbox?tab=other" : "/inbox";
  const threads = initialThreads;
  // `inbox_tab_counts` and `thread_list_filtered` operate over the same
  // fully-populated set (latest INBOX message per thread), so the count RPC
  // is the source of truth for pagination totals.
  const total = tab === "other" ? tabCounts.other_total : tabCounts.primary_total;
  const emptyTitle = tab === "other" ? "Other is empty" : "Primary is empty";
  const emptyHint =
    tab === "other"
      ? "Anything Gmail didn't tag Important or Personal lands here."
      : "Important threads and personal mail show up here.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SyncBanner
        status={user.sync_status}
        count={user.sync_progress_count}
        total={user.sync_progress_total}
      />
      <InboxTabs
        activeTab={tab}
        primaryUnread={tabCounts.primary_unread}
        otherUnread={tabCounts.other_unread}
      />
      <ThreadList
        threads={threads}
        page={page}
        pageSize={PAGE_SIZE}
        approxTotal={total}
        basePath={basePath}
        emptyTitle={emptyTitle}
        emptyHint={emptyHint}
      />
    </div>
  );
}

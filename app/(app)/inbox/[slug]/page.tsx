import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ThreadList } from "@/components/gmail/thread-list";
import { listThreadsForLabel, getThreadLabelCounts } from "@/lib/db/inbox";
import { getInboxView } from "@/lib/inbox-labels";
import { getUserById } from "@/lib/db/users";
import { SyncBanner } from "@/components/gmail/sync-banner";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  p?: string;
}

export default async function LabelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;

  const { slug } = await params;
  const view = getInboxView(slug);
  if (!view) notFound();

  const user = await getUserById(userId);
  if (!user) redirect("/");
  if (user.sync_status === "pending" || user.sync_status === "failed") {
    redirect("/sync");
  }

  const sp = await searchParams;
  const page = Math.max(0, parseInt(sp.p ?? "0", 10) || 0);

  const [threads, counts] = await Promise.all([
    view.gmailLabel
      ? listThreadsForLabel(userId, {
          label: view.gmailLabel,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        })
      : Promise.resolve([]),
    getThreadLabelCounts(userId).catch(() => []),
  ]);

  const total = view.gmailLabel
    ? counts.find((c) => c.label === view.gmailLabel)?.total_count
    : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SyncBanner status={user.sync_status} count={user.sync_progress_count} total={user.sync_progress_total} />
      <ThreadList
        threads={threads}
        page={page}
        pageSize={PAGE_SIZE}
        approxTotal={total}
        basePath={`/inbox/${view.slug}`}
        emptyTitle={`${view.title} is empty`}
        emptyHint={view.emptyHint}
      />
    </div>
  );
}

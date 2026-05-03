import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw, MoreHorizontal, Inbox } from "lucide-react";
import { ThreadRow } from "@/components/gmail/thread-row";
import type { InboxThreadRow } from "@/lib/db/inbox";

export interface ThreadListProps {
  threads: InboxThreadRow[];
  /** 0-indexed page */
  page: number;
  /** Page size */
  pageSize: number;
  /** Optional approximate total to render `1-50 of ~12,345`. */
  approxTotal?: number;
  basePath: string;
  emptyTitle?: string;
  emptyHint?: string;
}

export function ThreadList({
  threads,
  page,
  pageSize,
  approxTotal,
  basePath,
  emptyTitle = "Nothing to show",
  emptyHint = "No conversations match this view yet.",
}: ThreadListProps) {
  const start = threads.length === 0 ? 0 : page * pageSize + 1;
  const end = page * pageSize + threads.length;
  const totalLabel =
    approxTotal !== undefined ? `${start.toLocaleString()}–${end.toLocaleString()} of ${approxTotal.toLocaleString()}` : `${start}–${end}`;
  const hasPrev = page > 0;
  const hasNext = threads.length === pageSize;
  const sep = basePath.includes("?") ? "&" : "?";

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-3 text-[#5f6368]">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
          aria-label="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
          aria-label="More"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-1 text-xs">
          <span className="tabular-nums">{totalLabel}</span>
          <Link
            href={hasPrev ? `${basePath}${sep}p=${page - 1}` : "#"}
            aria-disabled={!hasPrev}
            className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4] ${hasPrev ? "" : "pointer-events-none opacity-40"}`}
            aria-label="Newer"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link
            href={hasNext ? `${basePath}${sep}p=${page + 1}` : "#"}
            aria-disabled={!hasNext}
            className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4] ${hasNext ? "" : "pointer-events-none opacity-40"}`}
            aria-label="Older"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {threads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <Inbox className="h-10 w-10 text-[#9aa0a6]" />
            <div className="text-base font-medium text-[#3c4043]">{emptyTitle}</div>
            <p className="max-w-md text-sm text-[#5f6368]">{emptyHint}</p>
          </div>
        ) : (
          threads.map((t) => <ThreadRow key={t.thread_db_id} thread={t} />)
        )}
      </div>
    </section>
  );
}

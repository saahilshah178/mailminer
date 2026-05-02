"use client";

import Link from "next/link";
import { Star, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { GmailAvatar } from "@/components/gmail/avatar";
import { formatGmailDate } from "@/lib/gmail-format";
import type { InboxThreadRow } from "@/lib/db/inbox";

export interface ThreadRowProps {
  thread: InboxThreadRow;
}

export function ThreadRow({ thread }: ThreadRowProps) {
  const senderDisplay =
    thread.latest_from_name?.trim() ||
    thread.latest_from_address ||
    (thread.participant_emails?.[0] ?? "Unknown");
  const date = formatGmailDate(thread.last_message_date);
  const subject = thread.subject?.trim() || "(no subject)";
  const snippet = thread.latest_snippet?.replace(/\s+/g, " ").trim() ?? "";
  const isUnread = thread.is_unread;

  return (
    <Link
      href={`/thread/${thread.thread_db_id}`}
      className={cn(
        "group grid grid-cols-[40px_40px_minmax(140px,200px)_1fr_auto] items-center gap-3 border-b px-2 py-2 text-sm transition-colors hover:z-10 hover:shadow-[inset_0_0_0_1px_rgba(60,64,67,0.16)] hover:bg-white",
        isUnread ? "bg-white" : "bg-[#f8fafd]",
      )}
    >
      <div className="flex items-center justify-center">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
          }}
          className="text-[#9aa0a6] hover:text-amber-500"
          aria-label={thread.is_starred ? "Unstar" : "Star"}
        >
          <Star
            className={cn(
              "h-4 w-4",
              thread.is_starred && "fill-amber-400 text-amber-500",
            )}
          />
        </button>
      </div>
      <div className="flex items-center justify-center">
        <GmailAvatar
          name={thread.latest_from_name}
          email={thread.latest_from_address}
          size={28}
        />
      </div>

      <div
        className={cn(
          "min-w-0 truncate",
          isUnread ? "font-semibold text-[#202124]" : "text-[#3c4043]",
        )}
      >
        <span className="truncate">{senderDisplay}</span>
        {thread.message_count > 1 && (
          <span className="ml-1 text-[#5f6368]">({thread.message_count})</span>
        )}
      </div>

      <div className="min-w-0 truncate">
        <span
          className={cn(
            "mr-2",
            isUnread ? "font-semibold text-[#202124]" : "text-[#3c4043]",
          )}
        >
          {subject}
        </span>
        {snippet && (
          <span className="text-[#5f6368]">
            {" - "}
            {snippet}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2 pr-2 text-xs">
        {thread.latest_has_attachments && (
          <Paperclip className="h-3.5 w-3.5 text-[#5f6368]" />
        )}
        <span
          className={cn(
            "tabular-nums",
            isUnread ? "font-semibold text-[#202124]" : "text-[#5f6368]",
          )}
          title={thread.last_message_date ?? undefined}
        >
          {date}
        </span>
      </div>
    </Link>
  );
}

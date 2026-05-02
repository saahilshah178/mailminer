"use client";

import { useState } from "react";
import { ChevronDown, Star, Reply, MoreVertical, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { GmailAvatar } from "@/components/gmail/avatar";
import { formatGmailFullTimestamp } from "@/lib/gmail-format";
import type { Email } from "@/types";

export interface ThreadMessageProps {
  email: Email;
  ownerEmail: string | null;
  defaultOpen?: boolean;
}

export function ThreadMessage({ email, ownerEmail, defaultOpen = false }: ThreadMessageProps) {
  const [open, setOpen] = useState(defaultOpen);
  const senderName = email.from_name?.trim() || email.from_address?.split("@")[0] || "Unknown";
  const senderEmail = email.from_address ?? "";
  const date = formatGmailFullTimestamp(email.date);
  const toLabel = buildToLabel(email.to_addresses, ownerEmail);
  const snippet = (email.body_text ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
  const isStarred = (email.labels ?? []).includes("STARRED");

  return (
    <article
      className={cn(
        "rounded-2xl border bg-white px-4 py-3 transition-shadow",
        open && "shadow-sm",
      )}
    >
      <header
        className="flex cursor-pointer items-start gap-3"
        onClick={() => setOpen((v) => !v)}
        role="button"
        aria-expanded={open}
      >
        <GmailAvatar name={email.from_name} email={email.from_address} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold text-[#202124]">{senderName}</span>
            <span className="text-xs text-[#5f6368]">&lt;{senderEmail}&gt;</span>
            {!open && snippet && (
              <span className="ml-2 hidden truncate text-xs text-[#5f6368] sm:inline">
                — {snippet}
              </span>
            )}
          </div>
          <div className="text-xs text-[#5f6368]">{toLabel}</div>
        </div>
        <div className="flex items-center gap-1 text-xs text-[#5f6368]">
          {email.has_attachments && <Paperclip className="h-3.5 w-3.5" />}
          <span className="whitespace-nowrap">{date}</span>
          <button
            type="button"
            className="rounded-full p-1 hover:bg-[#f1f3f4]"
            aria-label={isStarred ? "Unstar" : "Star"}
            onClick={(e) => e.stopPropagation()}
          >
            <Star
              className={cn(
                "h-4 w-4",
                isStarred ? "fill-amber-400 text-amber-500" : "text-[#5f6368]",
              )}
            />
          </button>
          <button
            type="button"
            className="rounded-full p-1 hover:bg-[#f1f3f4]"
            aria-label="Reply"
            onClick={(e) => e.stopPropagation()}
          >
            <Reply className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full p-1 hover:bg-[#f1f3f4]"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              open ? "rotate-180" : "rotate-0",
            )}
          />
        </div>
      </header>

      {open && (
        <div className="ml-12 mt-3 space-y-4 text-[15px] leading-7 text-[#202124]">
          <pre className="whitespace-pre-wrap break-words font-sans text-[15px]">
            {email.body_text ?? "(empty)"}
          </pre>
        </div>
      )}
    </article>
  );
}

function buildToLabel(to: string[] | null | undefined, ownerEmail: string | null): string {
  const list = to ?? [];
  if (list.length === 0) return "to me";
  if (ownerEmail && list.some((e) => e.toLowerCase() === ownerEmail.toLowerCase())) {
    if (list.length === 1) return "to me";
    return `to me, ${list.length - 1} more`;
  }
  if (list.length === 1) return `to ${list[0]}`;
  return `to ${list[0]}, ${list.length - 1} more`;
}

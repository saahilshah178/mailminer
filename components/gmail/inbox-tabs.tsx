import Link from "next/link";
import { Inbox, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InboxTab } from "@/lib/inbox-labels";

export interface InboxTabsProps {
  activeTab: InboxTab;
  primaryUnread: number;
  otherUnread: number;
  basePath?: string;
}

interface TabSpec {
  id: InboxTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  unread: number;
}

export function InboxTabs({
  activeTab,
  primaryUnread,
  otherUnread,
  basePath = "/inbox",
}: InboxTabsProps) {
  const tabs: TabSpec[] = [
    { id: "primary", label: "Primary", icon: Inbox, unread: primaryUnread },
    { id: "other", label: "Other", icon: Tag, unread: otherUnread },
  ];

  return (
    <div role="tablist" className="flex h-12 shrink-0 items-stretch border-b">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const href = tab.id === "primary" ? basePath : `${basePath}?tab=other`;
        return (
          <Link
            key={tab.id}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "group relative flex min-w-[140px] flex-1 items-center gap-3 px-4 text-sm transition-colors hover:bg-[#f1f3f4] sm:flex-none",
              isActive ? "text-[#1a73e8]" : "text-[#5f6368]",
            )}
          >
            <tab.icon
              className={cn(
                "h-5 w-5 shrink-0",
                isActive ? "text-[#1a73e8]" : "text-[#5f6368]",
              )}
            />
            <span className={cn("font-medium", isActive && "text-[#1a73e8]")}>
              {tab.label}
            </span>
            {tab.unread > 0 && (
              <span
                className={cn(
                  "ml-1 text-xs font-semibold tabular-nums",
                  isActive ? "text-[#1a73e8]" : "text-[#1f1f1f]",
                )}
              >
                {formatUnread(tab.unread)} new
              </span>
            )}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 bottom-0 h-[3px] rounded-t",
                isActive ? "bg-[#1a73e8]" : "bg-transparent",
              )}
            />
          </Link>
        );
      })}
    </div>
  );
}

function formatUnread(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 100) / 10}k`;
  return String(n);
}

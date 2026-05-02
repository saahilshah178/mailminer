"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Inbox,
  Star,
  Clock,
  Send,
  FileText,
  AlertOctagon,
  Trash2,
  Tag,
  Users,
  ShoppingBag,
  Info,
  MessageSquare,
  Sparkles,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavCounts {
  total: number;
  unread: number;
}

interface NavItem {
  label: string;
  href: string;
  gmailLabel?: string | null;
  icon: React.ComponentType<{ className?: string }>;
  showUnread?: boolean;
  showTotal?: boolean;
  exact?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { label: "Inbox", href: "/inbox", gmailLabel: "INBOX", icon: Inbox, showUnread: true },
  { label: "Starred", href: "/inbox/starred", gmailLabel: "STARRED", icon: Star, showTotal: true },
  { label: "Snoozed", href: "/inbox/snoozed", gmailLabel: null, icon: Clock },
  { label: "Sent", href: "/inbox/sent", gmailLabel: "SENT", icon: Send, showTotal: true },
  { label: "Drafts", href: "/inbox/drafts", gmailLabel: "DRAFT", icon: FileText, showTotal: true },
  {
    label: "Important",
    href: "/inbox/important",
    gmailLabel: "IMPORTANT",
    icon: AlertOctagon,
    showTotal: true,
  },
  { label: "Spam", href: "/inbox/spam", gmailLabel: "SPAM", icon: AlertOctagon, showTotal: true },
  { label: "Trash", href: "/inbox/trash", gmailLabel: "TRASH", icon: Trash2, showTotal: true },
];

const CATEGORY_NAV: NavItem[] = [
  {
    label: "Social",
    href: "/inbox/social",
    gmailLabel: "CATEGORY_SOCIAL",
    icon: Users,
    showUnread: true,
  },
  {
    label: "Updates",
    href: "/inbox/updates",
    gmailLabel: "CATEGORY_UPDATES",
    icon: Info,
    showUnread: true,
  },
  {
    label: "Forums",
    href: "/inbox/forums",
    gmailLabel: "CATEGORY_FORUMS",
    icon: MessageSquare,
    showUnread: true,
  },
  {
    label: "Promotions",
    href: "/inbox/promotions",
    gmailLabel: "CATEGORY_PROMOTIONS",
    icon: ShoppingBag,
    showUnread: true,
  },
];

export interface GmailSidebarProps {
  collapsed?: boolean;
  labelCounts: Record<string, { total: number; unread: number }>;
  syncStatus?: "pending" | "in_progress" | "complete" | "failed";
}

export function GmailSidebar({ collapsed, labelCounts, syncStatus }: GmailSidebarProps) {
  return (
    <aside
      className={cn(
        "hidden border-r bg-[#f6f8fc] md:flex md:flex-col",
        collapsed ? "md:w-[72px]" : "md:w-64",
      )}
    >
      <div className="px-3 py-4">
        <Link
          href="/compose"
          className={cn(
            "inline-flex h-14 items-center gap-3 rounded-2xl bg-[#c2e7ff] px-5 text-sm font-medium text-[#001d35] shadow-sm transition-shadow hover:shadow-md",
            collapsed && "h-12 w-12 justify-center px-0",
          )}
          aria-label="Compose"
          title="Compose"
        >
          <Pencil className="h-5 w-5" />
          {!collapsed && <span>Compose</span>}
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto pb-6">
        <SidebarSection items={PRIMARY_NAV} counts={labelCounts} collapsed={collapsed} />
        {!collapsed && <SidebarHeading label="Categories" />}
        <SidebarSection items={CATEGORY_NAV} counts={labelCounts} collapsed={collapsed} />

        {!collapsed && <SidebarHeading label="Inbox AI" />}
        <ul className="px-2">
          <li>
            <Link
              href="/ask"
              className="flex h-9 items-center gap-4 rounded-r-full pr-3 pl-6 text-sm text-[#1f1f1f] transition-colors hover:bg-[#e8eaed]"
            >
              <Sparkles className="h-4 w-4 text-[#5f6368]" />
              {!collapsed && <span>Ask AI</span>}
            </Link>
          </li>
          <li>
            <Link
              href="/sync"
              className="flex h-9 items-center gap-4 rounded-r-full pr-3 pl-6 text-sm text-[#1f1f1f] transition-colors hover:bg-[#e8eaed]"
            >
              <RefreshCw className="h-4 w-4 text-[#5f6368]" />
              {!collapsed && (
                <span className="flex flex-1 items-center justify-between">
                  <span>Sync</span>
                  {syncStatus === "in_progress" && (
                    <span className="text-xs text-[#5f6368]">running…</span>
                  )}
                </span>
              )}
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}

function SidebarHeading({ label }: { label: string }) {
  return (
    <div className="mt-3 px-6 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-[#5f6368]">
      {label}
    </div>
  );
}

function SidebarSection({
  items,
  counts,
  collapsed,
}: {
  items: NavItem[];
  counts: Record<string, { total: number; unread: number }>;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const currentLabel = search.get("label");
  return (
    <ul className="px-2">
      {items.map((item) => {
        const isActive = isItemActive(item, pathname, currentLabel);
        const c = item.gmailLabel ? counts[item.gmailLabel] : undefined;
        const unread = c?.unread ?? 0;
        const total = c?.total ?? 0;
        return (
          <li key={item.label}>
            <Link
              href={item.href}
              className={cn(
                "group relative flex h-8 items-center gap-4 rounded-r-full pr-3 pl-6 text-sm text-[#1f1f1f] transition-colors hover:bg-[#e8eaed]",
                isActive && "bg-[#d3e3fd] font-bold text-[#001d35] hover:bg-[#d3e3fd]",
              )}
              title={item.label}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  isActive ? "text-[#001d35]" : "text-[#5f6368]",
                )}
              />
              {!collapsed && (
                <span className="flex flex-1 items-center justify-between gap-2 truncate">
                  <span className="truncate">{item.label}</span>
                  {item.showUnread && unread > 0 && (
                    <span className="text-xs font-bold text-[#001d35]">
                      {formatCount(unread)}
                    </span>
                  )}
                  {!item.showUnread && item.showTotal && total > 0 && (
                    <span className="text-xs text-[#5f6368]">{formatCount(total)}</span>
                  )}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function isItemActive(
  item: NavItem,
  pathname: string,
  _currentLabel: string | null,
): boolean {
  if (item.href === "/inbox") {
    return pathname === "/inbox";
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function formatCount(n: number): string {
  if (n >= 1000) return `${Math.floor(n / 100) / 10}k`;
  return String(n);
}

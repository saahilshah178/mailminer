"use client";

import { useState, type ReactNode } from "react";
import { GmailHeader } from "@/components/gmail/header";
import { GmailSidebar } from "@/components/gmail/sidebar";

export interface GmailLayoutShellProps {
  user: { email: string; name: string | null; image: string | null };
  labelCounts: Record<string, { total: number; unread: number }>;
  syncStatus?: "pending" | "in_progress" | "complete" | "failed";
  signOutSlot?: ReactNode;
  children: ReactNode;
}

export function GmailLayoutShell({
  user,
  labelCounts,
  syncStatus,
  signOutSlot,
  children,
}: GmailLayoutShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-[#f6f8fc]">
      <GmailHeader
        user={user}
        signOutSlot={signOutSlot}
        onToggleSidebar={() => setCollapsed((v) => !v)}
      />
      <div className="flex min-h-0 flex-1">
        <GmailSidebar collapsed={collapsed} labelCounts={labelCounts} syncStatus={syncStatus} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white md:m-2 md:rounded-2xl md:shadow-sm">
          {children}
        </main>
      </div>
    </div>
  );
}

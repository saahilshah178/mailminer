"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Menu, Search, Settings, HelpCircle, LogOut, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GmailAvatar } from "@/components/gmail/avatar";

export interface GmailHeaderProps {
  user: { email: string; name: string | null; image: string | null };
  onToggleSidebar: () => void;
  signOutSlot?: React.ReactNode;
}

export function GmailHeader({ user, onToggleSidebar, signOutSlot }: GmailHeaderProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      router.push("/inbox");
      return;
    }
    router.push(`/ask?q=${encodeURIComponent(q)}`);
  }

  function clearQuery() {
    setQuery("");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-white px-2 md:px-4">
      <button
        type="button"
        onClick={onToggleSidebar}
        className="flex h-10 w-10 items-center justify-center rounded-full text-[#5f6368] transition-colors hover:bg-[#f1f3f4]"
        aria-label="Toggle navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link href="/inbox" className="flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-rose-500 via-amber-400 to-emerald-500 text-sm font-bold text-white">
          M
        </span>
        <span className="hidden text-xl font-medium text-[#5f6368] md:inline">Inbox AI</span>
      </Link>

      <form
        onSubmit={onSubmit}
        className={cn(
          "relative ml-2 hidden h-12 max-w-[720px] flex-1 items-center rounded-3xl bg-[#eaf1fb] px-4 transition-shadow focus-within:bg-white focus-within:shadow-md md:flex",
        )}
      >
        <Search className="mr-3 h-5 w-5 text-[#5f6368]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask AI or search mail"
          className="h-full flex-1 bg-transparent text-base text-[#1f1f1f] outline-none placeholder:text-[#5f6368]"
          aria-label="Search mail"
        />
        {query && (
          <button
            type="button"
            onClick={clearQuery}
            className="rounded-full p-1 text-[#5f6368] hover:bg-[#e1e3e6]"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <Link
          href={`/ask${query ? `?q=${encodeURIComponent(query)}` : ""}`}
          className="ml-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-medium text-[#0b57d0] shadow-sm hover:bg-slate-50"
          title="Ask AI"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ask AI
        </Link>
      </form>

      <div className="flex flex-1 justify-end md:flex-none">
        <Link
          href="/sync"
          className="hidden h-10 w-10 items-center justify-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4] md:flex"
          aria-label="Settings"
          title="Sync settings"
        >
          <Settings className="h-5 w-5" />
        </Link>
        <button
          type="button"
          className="hidden h-10 w-10 items-center justify-center rounded-full text-[#5f6368] hover:bg-[#f1f3f4] md:flex"
          aria-label="Help"
          title="Help"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
        <div className="relative ml-1" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
            aria-label="Account"
          >
            <GmailAvatar name={user.name} email={user.email} size={32} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-12 w-72 overflow-hidden rounded-2xl border bg-white shadow-2xl">
              <div className="flex items-center gap-3 px-4 py-4">
                <GmailAvatar name={user.name} email={user.email} size={48} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[#1f1f1f]">
                    {user.name ?? user.email}
                  </div>
                  <div className="truncate text-xs text-[#5f6368]">{user.email}</div>
                </div>
              </div>
              <div className="border-t bg-[#f6f8fc] p-2">
                {signOutSlot ?? (
                  <a
                    href="/api/auth/signout"
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-[#1f1f1f] hover:bg-white"
                  >
                    <LogOut className="h-4 w-4 text-[#5f6368]" />
                    Sign out
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

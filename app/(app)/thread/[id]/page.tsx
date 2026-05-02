import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Archive,
  Trash2,
  AlertOctagon,
  MailOpen,
  Clock,
  Tag,
  MoreVertical,
  Sparkles,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { ThreadMessage } from "@/components/gmail/thread-message";
import { cacheThreadSummary, getThreadWithEmails } from "@/lib/db/threads";
import { summarizeThread } from "@/lib/llm";

export const dynamic = "force-dynamic";

const KNOWN_LABEL_NAMES: Record<string, string> = {
  INBOX: "Inbox",
  IMPORTANT: "Important",
  STARRED: "Starred",
  SENT: "Sent",
  DRAFT: "Draft",
  SPAM: "Spam",
  TRASH: "Trash",
  CATEGORY_PERSONAL: "Personal",
  CATEGORY_SOCIAL: "Social",
  CATEGORY_PROMOTIONS: "Promotions",
  CATEGORY_UPDATES: "Updates",
  CATEGORY_FORUMS: "Forums",
};

export default async function ThreadDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
  const ownerEmail = session.user.email ?? null;
  const threadId = params.id;

  const thread = await getThreadWithEmails(userId, threadId);
  if (!thread) notFound();

  let summary = thread.thread_summary;
  if (!summary && thread.emails.length > 0) {
    try {
      summary = await summarizeThread(
        thread.subject,
        thread.emails.map((e) => ({
          from_name: e.from_name,
          from_address: e.from_address,
          date: e.date,
          body_text: e.body_text,
        })),
      );
      await cacheThreadSummary(userId, threadId, summary);
    } catch (err) {
      console.error("ThreadDetailPage summary failed", {
        userId,
        threadId,
        error: (err as Error).message,
      });
    }
  }

  const aggregateLabels = new Set<string>();
  for (const email of thread.emails) {
    for (const l of email.labels ?? []) aggregateLabels.add(l);
  }
  const visibleLabels = Array.from(aggregateLabels).filter(
    (l) =>
      KNOWN_LABEL_NAMES[l] &&
      l !== "UNREAD" &&
      l !== "STARRED",
  );

  const subject = thread.subject?.trim() || "(no subject)";
  const messageCount = thread.emails.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2 text-[#5f6368]">
        <Link
          href="/inbox"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
          aria-label="Back to inbox"
          title="Back to inbox"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <ToolbarBtn icon={Archive} label="Archive" />
        <ToolbarBtn icon={AlertOctagon} label="Report spam" />
        <ToolbarBtn icon={Trash2} label="Delete" />
        <span className="mx-1 h-5 w-px bg-[#dadce0]" />
        <ToolbarBtn icon={MailOpen} label="Mark as unread" />
        <ToolbarBtn icon={Clock} label="Snooze" />
        <ToolbarBtn icon={Tag} label="Labels" />
        <ToolbarBtn icon={MoreVertical} label="More" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[940px] px-4 py-6">
          <div className="flex items-start gap-3">
            <h1 className="flex-1 text-2xl font-normal text-[#202124]">
              {subject}{" "}
              {messageCount > 1 && (
                <span className="text-[#5f6368]">({messageCount})</span>
              )}
            </h1>
          </div>
          {visibleLabels.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleLabels.map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center rounded-md border bg-[#f1f3f4] px-2 py-0.5 text-xs font-medium text-[#3c4043]"
                >
                  {KNOWN_LABEL_NAMES[l]}
                </span>
              ))}
            </div>
          )}

          {summary && (
            <aside className="mt-5 rounded-2xl border bg-gradient-to-br from-[#eef4ff] via-[#f7f5ff] to-[#fef3ff] p-4 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs font-medium text-[#0b57d0]">
                <Sparkles className="h-3.5 w-3.5" />
                Inbox AI summary
              </div>
              <p className="whitespace-pre-wrap leading-6 text-[#202124]">{summary}</p>
            </aside>
          )}

          <div className="mt-6 space-y-3">
            {thread.emails.map((email, i) => {
              const isLast = i === thread.emails.length - 1;
              return (
                <ThreadMessage
                  key={email.id}
                  email={email}
                  ownerEmail={ownerEmail}
                  defaultOpen={isLast || messageCount === 1}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f3f4]"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { ThreadSummary } from "@/components/thread-summary";
import { cacheThreadSummary, getThreadWithEmails } from "@/lib/db/threads";
import { summarizeThread } from "@/lib/llm";
import { formatRelativeDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ThreadDetailPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const userId = session.user.id;
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <Link href="/search" className="text-xs text-muted-foreground hover:underline">
          ← Back to search
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {thread.subject ?? "(no subject)"}
        </h1>
        <div className="text-xs text-muted-foreground">
          {thread.message_count} messages · {thread.participant_emails.slice(0, 4).join(", ")}
          {thread.participant_emails.length > 4 ? "…" : ""}
        </div>
      </div>

      {summary && <ThreadSummary summary={summary} />}

      <div className="space-y-3">
        {thread.emails.map((email, i) => (
          <Card key={email.id}>
            <CardContent className="space-y-2 p-5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">
                    {email.from_name ?? email.from_address ?? "Unknown sender"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {email.from_address}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeDate(email.date)}
                </div>
              </div>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                {email.body_text ?? "(empty)"}
              </pre>
              {i < thread.emails.length - 1 && (
                <div className="border-t pt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Reply
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeDate, truncate } from "@/lib/utils";
import { listRecentThreads } from "@/lib/db/threads";

export async function RecentThreads({ userId }: { userId: string }) {
  const threads = await listRecentThreads(userId, 15);
  if (threads.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Your recent threads will appear here once sync is underway.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {threads.map((t) => (
        <Link key={t.id} href={`/thread/${t.id}`} className="block">
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-sm font-medium">
                    {t.subject ?? "(no subject)"}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {t.participant_emails?.slice(0, 3).join(", ") ?? ""}
                    {(t.participant_emails?.length ?? 0) > 3 ? "…" : ""}
                  </div>
                  {t.thread_summary && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {truncate(t.thread_summary, 120)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeDate(t.last_message_date)}
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

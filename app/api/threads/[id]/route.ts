import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cacheThreadSummary, getThreadWithEmails } from "@/lib/db/threads";
import { summarizeThread } from "@/lib/llm";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const threadId = ctx.params.id;

  try {
    const thread = await getThreadWithEmails(userId, threadId);
    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    if (!thread.thread_summary && thread.emails.length > 0) {
      try {
        const summary = await summarizeThread(
          thread.subject,
          thread.emails.map((e) => ({
            from_name: e.from_name,
            from_address: e.from_address,
            date: e.date,
            body_text: e.body_text,
          })),
        );
        await cacheThreadSummary(userId, threadId, summary);
        thread.thread_summary = summary;
        thread.summary_generated_at = new Date().toISOString();
      } catch (err) {
        console.error("thread summary generation failed", {
          userId,
          threadId,
          error: (err as Error).message,
        });
      }
    }

    return NextResponse.json(thread);
  } catch (err) {
    console.error("GET /api/threads/[id] failed", {
      userId,
      threadId,
      error: (err as Error).message,
    });
    return NextResponse.json({ error: "Failed to load thread" }, { status: 500 });
  }
}

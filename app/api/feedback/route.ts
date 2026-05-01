import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { FeedbackRequestSchema } from "@/lib/validation";
import { recordFeedback } from "@/lib/db/search-queries";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = FeedbackRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { queryId, feedback } = parsed.data;
  try {
    await recordFeedback(userId, queryId, feedback);
    console.info("feedback.recorded", { userId, queryId, feedback });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/feedback failed", { userId, queryId, error: (err as Error).message });
    return NextResponse.json({ error: "Failed to record feedback" }, { status: 500 });
  }
}

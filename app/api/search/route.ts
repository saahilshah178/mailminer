import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SearchRequestSchema } from "@/lib/validation";
import { embedQuery } from "@/lib/embeddings";
import { extractFilters, synthesizeAnswer, type SynthesisEmail } from "@/lib/llm";
import { searchSimilar } from "@/lib/db/emails";
import { logQuery } from "@/lib/db/search-queries";
import type { SearchCitation, SearchResult } from "@/types";
import { truncate } from "@/lib/utils";

const RETRIEVAL_K = 30;
const SYNTHESIS_K = 10;

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
  const parsed = SearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.flatten() }, { status: 400 });
  }
  const { query } = parsed.data;

  try {
    const [queryEmbedding, filters] = await Promise.all([
      embedQuery(query),
      extractFilters(query),
    ]);

    let candidates = await searchSimilar(userId, queryEmbedding, RETRIEVAL_K, filters);
    // If filters are too aggressive and zero out results, retry without them.
    if (candidates.length === 0 && Object.keys(filters).length > 0) {
      candidates = await searchSimilar(userId, queryEmbedding, RETRIEVAL_K, {});
    }

    const top = candidates.slice(0, SYNTHESIS_K);
    const synthEmails: SynthesisEmail[] = top.map((c) => ({
      id: c.id,
      from_name: c.from_name,
      from_address: c.from_address,
      date: c.date,
      subject: c.subject,
      body_text: c.body_text,
    }));

    const answer = await synthesizeAnswer(query, synthEmails);

    const citations: SearchCitation[] = top.map((c) => ({
      id: c.id,
      gmail_message_id: c.gmail_message_id,
      thread_id: c.thread_id,
      subject: c.subject,
      from_name: c.from_name,
      from_address: c.from_address,
      date: c.date,
      snippet: truncate(c.body_text ?? "", 280),
      similarity: c.similarity,
    }));

    const queryId = await logQuery({
      userId,
      query,
      resultEmailIds: top.map((c) => c.id),
      answer,
    });

    const result: SearchResult = { queryId, answer, citations };
    return NextResponse.json(result);
  } catch (err) {
    console.error("POST /api/search failed", { userId, error: (err as Error).message });
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

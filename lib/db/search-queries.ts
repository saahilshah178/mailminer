import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface LogQueryInput {
  userId: string;
  query: string;
  resultEmailIds: string[];
  answer: string;
}

/**
 * Persist a query for debugging/improvement. Logs metadata only — body content
 * is never written to logs (only stored in DB which is owner-scoped via RLS).
 */
export async function logQuery(input: LogQueryInput): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("search_queries")
    .insert({
      user_id: input.userId,
      query: input.query,
      result_email_ids: input.resultEmailIds,
      answer: input.answer,
    })
    .select("id")
    .single();
  if (error) {
    console.error("logQuery failed", { userId: input.userId, error: error.message });
    throw new Error("Failed to log query");
  }
  console.info("search_query.logged", {
    userId: input.userId,
    queryId: data.id,
    resultCount: input.resultEmailIds.length,
  });
  return data.id as string;
}

export async function recordFeedback(
  userId: string,
  queryId: string,
  feedback: "helpful" | "not_helpful",
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("search_queries")
    .update({ feedback })
    .eq("id", queryId)
    .eq("user_id", userId);
  if (error) {
    console.error("recordFeedback failed", { userId, queryId, error: error.message });
    throw new Error("Failed to record feedback");
  }
}

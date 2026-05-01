import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Email, ParsedEmail, QueryFilters } from "@/types";

export interface BulkUpsertResult {
  upserted: { id: string; gmail_message_id: string }[];
}

/**
 * Upsert a batch of parsed Gmail messages for a user. Returns the inserted
 * rows' ids so the caller can correlate them to embeddings.
 */
export async function bulkUpsertEmails(
  userId: string,
  emails: ParsedEmail[],
): Promise<BulkUpsertResult> {
  if (emails.length === 0) return { upserted: [] };
  const supabase = getSupabaseAdmin();

  const rows = emails.map((e) => ({
    user_id: userId,
    gmail_message_id: e.gmail_message_id,
    thread_id: e.thread_id,
    subject: e.subject,
    from_address: e.from_address,
    from_name: e.from_name,
    to_addresses: e.to_addresses,
    cc_addresses: e.cc_addresses,
    date: e.date,
    body_text: e.body_text,
    has_attachments: e.has_attachments,
    labels: e.labels,
  }));

  const { data, error } = await supabase
    .from("emails")
    .upsert(rows, { onConflict: "user_id,gmail_message_id" })
    .select("id, gmail_message_id");

  if (error) {
    console.error("bulkUpsertEmails failed", { userId, count: rows.length, error: error.message });
    throw new Error("Failed to upsert emails");
  }
  return { upserted: (data ?? []) as { id: string; gmail_message_id: string }[] };
}

/**
 * Update embeddings for a batch of email rows. Each item must already exist.
 */
export async function updateEmbeddings(
  userId: string,
  rows: { id: string; embedding: number[] }[],
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = getSupabaseAdmin();
  for (const row of rows) {
    const { error } = await supabase
      .from("emails")
      .update({ embedding: row.embedding as unknown as string })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (error) {
      console.error("updateEmbeddings failed", { userId, emailId: row.id, error: error.message });
      throw new Error("Failed to write embedding");
    }
  }
}

export interface SimilarEmail {
  id: string;
  gmail_message_id: string;
  thread_id: string;
  subject: string | null;
  from_address: string | null;
  from_name: string | null;
  to_addresses: string[] | null;
  date: string | null;
  body_text: string | null;
  has_attachments: boolean;
  labels: string[] | null;
  similarity: number;
}

export async function searchSimilar(
  userId: string,
  queryEmbedding: number[],
  k: number,
  filters: QueryFilters,
): Promise<SimilarEmail[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("match_emails", {
    p_user_id: userId,
    p_query_embedding: queryEmbedding as unknown as string,
    p_match_count: k,
    p_date_from: filters.dateFrom ?? null,
    p_date_to: filters.dateTo ?? null,
    p_sender_domain: filters.senderDomain ?? null,
    p_has_attachments: filters.hasAttachments ?? null,
  });
  if (error) {
    console.error("searchSimilar failed", { userId, error: error.message });
    throw new Error("Vector search failed");
  }
  return (data ?? []) as SimilarEmail[];
}

export async function getEmailById(userId: string, emailId: string): Promise<Email | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("emails")
    .select("*")
    .eq("id", emailId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("getEmailById failed", { userId, emailId, error: error.message });
    throw new Error("Failed to load email");
  }
  return (data as Email | null) ?? null;
}

export async function getEmailCountForUser(userId: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error("getEmailCountForUser failed", { userId, error: error.message });
    throw new Error("Failed to count emails");
  }
  return count ?? 0;
}

export async function getEmailsByGmailIds(
  userId: string,
  gmailMessageIds: string[],
): Promise<Email[]> {
  if (gmailMessageIds.length === 0) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("emails")
    .select("*")
    .eq("user_id", userId)
    .in("gmail_message_id", gmailMessageIds);
  if (error) {
    console.error("getEmailsByGmailIds failed", { userId, error: error.message });
    throw new Error("Failed to load emails");
  }
  return (data as Email[]) ?? [];
}

export async function deleteEmailsByGmailIds(
  userId: string,
  gmailMessageIds: string[],
): Promise<void> {
  if (gmailMessageIds.length === 0) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("emails")
    .delete()
    .eq("user_id", userId)
    .in("gmail_message_id", gmailMessageIds);
  if (error) {
    console.error("deleteEmailsByGmailIds failed", { userId, error: error.message });
    throw new Error("Failed to delete emails");
  }
}

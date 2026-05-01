import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Email, Thread, ThreadWithEmails } from "@/types";

/**
 * Re-aggregate threads from the emails table. Idempotent: safe to run after
 * each batch of email upserts during sync.
 */
export async function rebuildThreadsForUser(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Pull all emails for the user (id-only is enough for grouping). For very
  // large mailboxes this would want server-side aggregation; at MVP scale
  // (a couple years of mail) it's fine.
  const { data: rows, error } = await supabase
    .from("emails")
    .select("thread_id, subject, from_address, date")
    .eq("user_id", userId);
  if (error) {
    console.error("rebuildThreadsForUser select failed", { userId, error: error.message });
    throw new Error("Failed to load emails for thread aggregation");
  }

  type Group = {
    thread_id: string;
    subject: string | null;
    participants: Set<string>;
    count: number;
    first: string | null;
    last: string | null;
  };
  const groups = new Map<string, Group>();
  for (const r of rows ?? []) {
    const tid = r.thread_id as string;
    const existing = groups.get(tid);
    const date = (r.date as string | null) ?? null;
    if (!existing) {
      groups.set(tid, {
        thread_id: tid,
        subject: (r.subject as string | null) ?? null,
        participants: new Set(r.from_address ? [r.from_address as string] : []),
        count: 1,
        first: date,
        last: date,
      });
    } else {
      existing.count++;
      if (r.from_address) existing.participants.add(r.from_address as string);
      if (date) {
        if (!existing.first || date < existing.first) existing.first = date;
        if (!existing.last || date > existing.last) existing.last = date;
      }
      if (!existing.subject && r.subject) existing.subject = r.subject as string;
    }
  }

  if (groups.size === 0) return;
  const upserts = Array.from(groups.values()).map((g) => ({
    user_id: userId,
    gmail_thread_id: g.thread_id,
    subject: g.subject,
    participant_emails: Array.from(g.participants),
    message_count: g.count,
    first_message_date: g.first,
    last_message_date: g.last,
  }));

  const CHUNK = 500;
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const slice = upserts.slice(i, i + CHUNK);
    const { error: upsertErr } = await supabase
      .from("threads")
      .upsert(slice, { onConflict: "user_id,gmail_thread_id" });
    if (upsertErr) {
      console.error("rebuildThreadsForUser upsert failed", {
        userId,
        error: upsertErr.message,
      });
      throw new Error("Failed to upsert threads");
    }
  }
}

export async function listRecentThreads(
  userId: string,
  limit = 20,
): Promise<Thread[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .eq("user_id", userId)
    .order("last_message_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listRecentThreads failed", { userId, error: error.message });
    throw new Error("Failed to load threads");
  }
  return (data as Thread[]) ?? [];
}

export async function getThreadWithEmails(
  userId: string,
  threadId: string,
): Promise<ThreadWithEmails | null> {
  const supabase = getSupabaseAdmin();
  const { data: thread, error: tErr } = await supabase
    .from("threads")
    .select("*")
    .eq("id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  if (tErr) {
    console.error("getThreadWithEmails thread failed", { userId, threadId, error: tErr.message });
    throw new Error("Failed to load thread");
  }
  if (!thread) return null;

  const { data: emails, error: eErr } = await supabase
    .from("emails")
    .select("*")
    .eq("user_id", userId)
    .eq("thread_id", (thread as Thread).gmail_thread_id)
    .order("date", { ascending: true });
  if (eErr) {
    console.error("getThreadWithEmails emails failed", { userId, threadId, error: eErr.message });
    throw new Error("Failed to load thread emails");
  }
  return {
    ...(thread as Thread),
    emails: (emails as Email[]) ?? [],
  };
}

export async function cacheThreadSummary(
  userId: string,
  threadId: string,
  summary: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("threads")
    .update({ thread_summary: summary, summary_generated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("user_id", userId);
  if (error) {
    console.error("cacheThreadSummary failed", { userId, threadId, error: error.message });
    throw new Error("Failed to cache thread summary");
  }
}

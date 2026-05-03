import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { type InboxTab } from "@/lib/inbox-labels";
import {
  classifyInboxTab,
  deriveGmailCategory,
  type GmailCategory,
} from "@/lib/gmail-category";

export interface InboxThreadRow {
  thread_db_id: string;
  gmail_thread_id: string;
  subject: string | null;
  participant_emails: string[];
  message_count: number;
  last_message_date: string | null;
  latest_from_address: string | null;
  latest_from_name: string | null;
  latest_snippet: string;
  latest_has_attachments: boolean;
  is_unread: boolean;
  is_starred: boolean;
  is_important: boolean;
  category: GmailCategory;
}

export interface ThreadLabelCount {
  label: string;
  total_count: number;
  unread_count: number;
}

export interface ListThreadsOpts {
  /**
   * Gmail label to filter on (e.g. "INBOX", "STARRED", "SENT", "IMPORTANT",
   * "CATEGORY_PROMOTIONS"). Pass `null` to disable filtering. Defaults to
   * "INBOX".
   */
  label?: string | null;
  limit?: number;
  offset?: number;
}

export interface ListThreadsFilteredOpts {
  /** Label that must be present on at least one message in the thread. */
  includeLabel?: string | null;
  /**
   * Inbox tab the thread must belong to, classified by `classifyInboxTab`
   * applied to the thread's *latest INBOX message*. `null` disables tab
   * filtering.
   */
  tab?: InboxTab | null;
  limit?: number;
  offset?: number;
}

export interface InboxTabCounts {
  primary_total: number;
  primary_unread: number;
  other_total: number;
  other_unread: number;
}

/**
 * List threads in inbox-style: latest sender, snippet, attachment + state flags.
 * Uses the `thread_list` Postgres RPC for efficiency. Falls back to a fully
 * client-side aggregation if the RPC is missing (e.g. migration not yet
 * applied).
 */
export async function listThreadsForLabel(
  userId: string,
  opts: ListThreadsOpts = {},
): Promise<InboxThreadRow[]> {
  const supabase = getSupabaseAdmin();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const label = opts.label === undefined ? "INBOX" : opts.label;

  // Try the RPC first.
  const { data, error } = await supabase.rpc("thread_list", {
    p_user_id: userId,
    p_label: label,
    p_limit: limit,
    p_offset: offset,
  });
  if (!error && data) {
    return (data as InboxThreadRow[]) ?? [];
  }

  if (error && !isMissingFunctionError(error.message)) {
    console.error("listThreadsForLabel rpc failed", { userId, label, error: error.message });
    throw new Error("Failed to load threads");
  }
  if (error) {
    console.warn("thread_list RPC missing, falling back to client aggregation", {
      userId,
      detail: error.message,
    });
  }

  return await listThreadsForLabelClientSide(userId, { label, limit, offset });
}

/**
 * Returns aggregated thread totals + unread totals per Gmail label.
 * Used to render the sidebar counts.
 */
export async function getThreadLabelCounts(userId: string): Promise<ThreadLabelCount[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("thread_label_counts", {
    p_user_id: userId,
  });
  if (!error && data) {
    return (
      (data as Array<{ label: string; total_count: number; unread_count: number }>) ?? []
    ).map((row) => ({
      label: row.label,
      total_count: Number(row.total_count ?? 0),
      unread_count: Number(row.unread_count ?? 0),
    }));
  }
  if (error && !isMissingFunctionError(error.message)) {
    console.error("getThreadLabelCounts rpc failed", { userId, error: error.message });
    return [];
  }
  return await getThreadLabelCountsClientSide(userId);
}

export function buildLabelCountMap(
  rows: ThreadLabelCount[],
): Record<string, { total: number; unread: number }> {
  const map: Record<string, { total: number; unread: number }> = {};
  for (const row of rows) {
    map[row.label] = { total: row.total_count, unread: row.unread_count };
  }
  return map;
}

/**
 * Generalised thread listing that filters by an include label + the
 * thread's *latest INBOX message* category. Backs the Primary/Other inbox
 * tabs. Falls back to client-side filtering when the `thread_list_filtered`
 * RPC isn't installed yet.
 */
export async function listThreadsFiltered(
  userId: string,
  opts: ListThreadsFilteredOpts = {},
): Promise<InboxThreadRow[]> {
  const supabase = getSupabaseAdmin();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const includeLabel = opts.includeLabel === undefined ? "INBOX" : opts.includeLabel;
  const tab = opts.tab ?? null;

  const { data, error } = await supabase.rpc("thread_list_filtered", {
    p_user_id: userId,
    p_include_label: includeLabel,
    p_tab: tab,
    p_limit: limit,
    p_offset: offset,
  });

  if (!error && data) {
    return (data as InboxThreadRow[]) ?? [];
  }

  if (error && !isMissingFunctionError(error.message)) {
    console.error("listThreadsFiltered rpc failed", {
      userId,
      includeLabel,
      error: error.message,
    });
    throw new Error("Failed to load threads");
  }
  if (error) {
    console.warn("thread_list_filtered RPC missing, falling back to client aggregation", {
      userId,
      detail: error.message,
    });
  }

  return await listThreadsFilteredClientSide(userId, {
    includeLabel,
    tab,
    limit,
    offset,
  });
}

/**
 * Convenience wrapper that maps an inbox tab ("primary" | "other") to the
 * GmailCategory set that defines it.
 */
export async function listThreadsForTab(
  userId: string,
  tab: InboxTab,
  opts: { limit?: number; offset?: number } = {},
): Promise<InboxThreadRow[]> {
  return await listThreadsFiltered(userId, {
    includeLabel: "INBOX",
    tab,
    ...opts,
  });
}

/**
 * Aggregate Primary + Other tab totals (and unread totals) in a single
 * round-trip. Falls back to client-side aggregation if the RPC is missing.
 */
export async function getInboxTabCounts(userId: string): Promise<InboxTabCounts> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("inbox_tab_counts", { p_user_id: userId });
  if (!error && data) {
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
          primary_total: number | string | null;
          primary_unread: number | string | null;
          other_total: number | string | null;
          other_unread: number | string | null;
        }
      | undefined;
    return {
      primary_total: Number(row?.primary_total ?? 0),
      primary_unread: Number(row?.primary_unread ?? 0),
      other_total: Number(row?.other_total ?? 0),
      other_unread: Number(row?.other_unread ?? 0),
    };
  }
  if (error && !isMissingFunctionError(error.message)) {
    console.error("getInboxTabCounts rpc failed", { userId, error: error.message });
    return { primary_total: 0, primary_unread: 0, other_total: 0, other_unread: 0 };
  }
  return await getInboxTabCountsClientSide(userId);
}

// ---------------------------------------------------------------------------
// Fallback: client-side aggregation that works without the 0004 migration.
// ---------------------------------------------------------------------------

function isMissingFunctionError(msg: string | null | undefined): boolean {
  if (!msg) return false;
  return /function .* does not exist|Could not find the function/i.test(msg);
}

async function listThreadsForLabelClientSide(
  userId: string,
  opts: { label: string | null; limit: number; offset: number },
): Promise<InboxThreadRow[]> {
  const supabase = getSupabaseAdmin();

  // Pull a generous candidate window so label filtering can prune some threads
  // without exhausting the page.
  const candidateLimit = (opts.offset + opts.limit) * 3 + 50;
  const { data: threads, error: threadsErr } = await supabase
    .from("threads")
    .select("id, gmail_thread_id, subject, participant_emails, message_count, last_message_date")
    .eq("user_id", userId)
    .order("last_message_date", { ascending: false, nullsFirst: false })
    .limit(candidateLimit);
  if (threadsErr) {
    console.error("listThreadsForLabel fallback select threads failed", {
      userId,
      error: threadsErr.message,
    });
    throw new Error("Failed to load threads");
  }
  if (!threads || threads.length === 0) return [];

  const threadIds = threads
    .map((t) => t.gmail_thread_id as string | null)
    .filter((id): id is string => Boolean(id));

  const { data: emails, error: emailsErr } = await supabase
    .from("emails")
    .select("thread_id, from_address, from_name, body_text, has_attachments, date, labels")
    .eq("user_id", userId)
    .in("thread_id", threadIds);
  if (emailsErr) {
    console.error("listThreadsForLabel fallback select emails failed", {
      userId,
      error: emailsErr.message,
    });
    throw new Error("Failed to load thread emails");
  }

  type EmailRow = {
    thread_id: string;
    from_address: string | null;
    from_name: string | null;
    body_text: string | null;
    has_attachments: boolean | null;
    date: string | null;
    labels: string[] | null;
  };
  const grouped = new Map<string, EmailRow[]>();
  for (const e of (emails as EmailRow[]) ?? []) {
    const list = grouped.get(e.thread_id) ?? [];
    list.push(e);
    grouped.set(e.thread_id, list);
  }

  const rows: InboxThreadRow[] = [];
  let skipped = 0;
  for (const t of threads) {
    const list = grouped.get(t.gmail_thread_id as string) ?? [];
    if (list.length === 0) continue;
    if (opts.label) {
      const hasLabel = list.some((e) => (e.labels ?? []).includes(opts.label as string));
      if (!hasLabel) continue;
    }

    list.sort((a, b) => {
      const aT = a.date ? Date.parse(a.date) : 0;
      const bT = b.date ? Date.parse(b.date) : 0;
      return bT - aT;
    });
    const latest = list[0];
    const allLabels = new Set<string>();
    for (const e of list) for (const l of e.labels ?? []) allLabels.add(l);

    if (skipped < opts.offset) {
      skipped++;
      continue;
    }

    rows.push({
      thread_db_id: t.id as string,
      gmail_thread_id: t.gmail_thread_id as string,
      subject: (t.subject as string | null) ?? null,
      participant_emails: (t.participant_emails as string[] | null) ?? [],
      message_count: (t.message_count as number | null) ?? list.length,
      last_message_date: (t.last_message_date as string | null) ?? latest.date,
      latest_from_address: latest.from_address,
      latest_from_name: latest.from_name,
      latest_snippet: (latest.body_text ?? "").slice(0, 220),
      latest_has_attachments: Boolean(latest.has_attachments),
      is_unread: allLabels.has("UNREAD"),
      is_starred: allLabels.has("STARRED"),
      is_important: allLabels.has("IMPORTANT"),
      category: deriveGmailCategory(latest.labels ?? []),
    });
    if (rows.length >= opts.limit) break;
  }
  return rows;
}

async function getThreadLabelCountsClientSide(userId: string): Promise<ThreadLabelCount[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("emails")
    .select("thread_id, labels")
    .eq("user_id", userId);
  if (error) {
    console.error("getThreadLabelCounts fallback failed", { userId, error: error.message });
    return [];
  }

  type Row = { thread_id: string; labels: string[] | null };
  const threadLabelSet = new Map<string, Set<string>>();
  const threadHasUnread = new Set<string>();
  for (const r of (data as Row[]) ?? []) {
    const set = threadLabelSet.get(r.thread_id) ?? new Set<string>();
    for (const l of r.labels ?? []) set.add(l);
    threadLabelSet.set(r.thread_id, set);
    if ((r.labels ?? []).includes("UNREAD")) threadHasUnread.add(r.thread_id);
  }

  const totals = new Map<string, number>();
  const unread = new Map<string, number>();
  for (const [tid, labels] of Array.from(threadLabelSet.entries())) {
    const isUnread = threadHasUnread.has(tid);
    for (const l of Array.from(labels)) {
      totals.set(l, (totals.get(l) ?? 0) + 1);
      if (isUnread) unread.set(l, (unread.get(l) ?? 0) + 1);
    }
  }
  return Array.from(totals.entries()).map(([label, total_count]) => ({
    label,
    total_count,
    unread_count: unread.get(label) ?? 0,
  }));
}

async function listThreadsFilteredClientSide(
  userId: string,
  opts: {
    includeLabel: string | null;
    tab: InboxTab | null;
    limit: number;
    offset: number;
  },
): Promise<InboxThreadRow[]> {
  const supabase = getSupabaseAdmin();

  // Pull a generous candidate window so category filtering can prune some
  // threads without exhausting the page.
  const candidateLimit = (opts.offset + opts.limit) * 4 + 100;
  const { data: threads, error: threadsErr } = await supabase
    .from("threads")
    .select("id, gmail_thread_id, subject, participant_emails, message_count, last_message_date")
    .eq("user_id", userId)
    .order("last_message_date", { ascending: false, nullsFirst: false })
    .limit(candidateLimit);
  if (threadsErr) {
    console.error("listThreadsFiltered fallback select threads failed", {
      userId,
      error: threadsErr.message,
    });
    throw new Error("Failed to load threads");
  }
  if (!threads || threads.length === 0) return [];

  const threadIds = threads
    .map((t) => t.gmail_thread_id as string | null)
    .filter((id): id is string => Boolean(id));

  const { data: emails, error: emailsErr } = await supabase
    .from("emails")
    .select("thread_id, from_address, from_name, body_text, has_attachments, date, labels")
    .eq("user_id", userId)
    .in("thread_id", threadIds);
  if (emailsErr) {
    console.error("listThreadsFiltered fallback select emails failed", {
      userId,
      error: emailsErr.message,
    });
    throw new Error("Failed to load thread emails");
  }

  type EmailRow = {
    thread_id: string;
    from_address: string | null;
    from_name: string | null;
    body_text: string | null;
    has_attachments: boolean | null;
    date: string | null;
    labels: string[] | null;
  };
  const grouped = new Map<string, EmailRow[]>();
  for (const e of (emails as EmailRow[]) ?? []) {
    const list = grouped.get(e.thread_id) ?? [];
    list.push(e);
    grouped.set(e.thread_id, list);
  }

  const rows: InboxThreadRow[] = [];
  let skipped = 0;
  for (const t of threads) {
    const list = grouped.get(t.gmail_thread_id as string) ?? [];
    if (list.length === 0) continue;

    const allLabels = new Set<string>();
    for (const e of list) for (const l of e.labels ?? []) allLabels.add(l);

    if (opts.includeLabel && !allLabels.has(opts.includeLabel)) continue;

    list.sort((a, b) => {
      const aT = a.date ? Date.parse(a.date) : 0;
      const bT = b.date ? Date.parse(b.date) : 0;
      return bT - aT;
    });
    const latest = list[0];

    // Classify the thread by its *latest INBOX message*, mirroring SQL.
    const latestInbox = list.find((e) => (e.labels ?? []).includes("INBOX")) ?? latest;
    const latestInboxLabels = latestInbox.labels ?? [];
    const threadCategory = deriveGmailCategory(latestInboxLabels);
    const threadTab = classifyInboxTab(latestInboxLabels);

    if (opts.tab && threadTab !== opts.tab) continue;

    if (skipped < opts.offset) {
      skipped++;
      continue;
    }

    rows.push({
      thread_db_id: t.id as string,
      gmail_thread_id: t.gmail_thread_id as string,
      subject: (t.subject as string | null) ?? null,
      participant_emails: (t.participant_emails as string[] | null) ?? [],
      message_count: (t.message_count as number | null) ?? list.length,
      last_message_date: (t.last_message_date as string | null) ?? latest.date,
      latest_from_address: latest.from_address,
      latest_from_name: latest.from_name,
      latest_snippet: (latest.body_text ?? "").slice(0, 220),
      latest_has_attachments: Boolean(latest.has_attachments),
      is_unread: allLabels.has("UNREAD"),
      is_starred: allLabels.has("STARRED"),
      is_important: allLabels.has("IMPORTANT"),
      category: threadCategory,
    });
    if (rows.length >= opts.limit) break;
  }
  return rows;
}

async function getInboxTabCountsClientSide(userId: string): Promise<InboxTabCounts> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("emails")
    .select("thread_id, date, labels")
    .eq("user_id", userId);
  if (error) {
    console.error("getInboxTabCounts fallback failed", { userId, error: error.message });
    return { primary_total: 0, primary_unread: 0, other_total: 0, other_unread: 0 };
  }

  type Row = { thread_id: string; date: string | null; labels: string[] | null };

  // Per-thread aggregate state.
  type ThreadState = {
    hasInbox: boolean;
    isUnread: boolean;
    latestInboxAt: number;
    latestInboxLabels: readonly string[];
  };
  const threadState = new Map<string, ThreadState>();
  for (const r of (data as Row[]) ?? []) {
    const labels = r.labels ?? [];
    const hasInbox = labels.includes("INBOX");
    const isUnread = labels.includes("UNREAD");
    const t = Date.parse(r.date ?? "");
    const ts = Number.isFinite(t) ? t : 0;
    const cur = threadState.get(r.thread_id) ?? {
      hasInbox: false,
      isUnread: false,
      latestInboxAt: -1,
      latestInboxLabels: [],
    };
    cur.hasInbox = cur.hasInbox || hasInbox;
    cur.isUnread = cur.isUnread || isUnread;
    if (hasInbox && ts >= cur.latestInboxAt) {
      cur.latestInboxAt = ts;
      cur.latestInboxLabels = labels;
    }
    threadState.set(r.thread_id, cur);
  }

  let primaryTotal = 0;
  let primaryUnread = 0;
  let otherTotal = 0;
  let otherUnread = 0;
  for (const state of Array.from(threadState.values())) {
    if (!state.hasInbox) continue;
    const tab = classifyInboxTab(state.latestInboxLabels);
    if (tab === "primary") {
      primaryTotal++;
      if (state.isUnread) primaryUnread++;
    } else if (tab === "other") {
      otherTotal++;
      if (state.isUnread) otherUnread++;
    }
  }
  return {
    primary_total: primaryTotal,
    primary_unread: primaryUnread,
    other_total: otherTotal,
    other_unread: otherUnread,
  };
}

import "server-only";
import { google, type gmail_v1 } from "googleapis";

/**
 * Build an authenticated Gmail client using a long-lived refresh token.
 * The OAuth2 client refreshes access tokens automatically when they expire.
 */
export function getGmailClient(refreshToken: string): gmail_v1.Gmail {
  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2 });
}

export interface ListMessageIdsOpts {
  pageToken?: string;
  query?: string;
  maxResults?: number;
}

export async function listMessageIds(
  gmail: gmail_v1.Gmail,
  opts: ListMessageIdsOpts = {},
): Promise<{ ids: string[]; nextPageToken: string | null; resultSizeEstimate: number }> {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: opts.query,
    pageToken: opts.pageToken,
    maxResults: opts.maxResults ?? 500,
  });
  const ids = (res.data.messages ?? []).map((m) => m.id).filter((x): x is string => Boolean(x));
  return {
    ids,
    nextPageToken: res.data.nextPageToken ?? null,
    resultSizeEstimate: res.data.resultSizeEstimate ?? 0,
  };
}

/**
 * Fetch a single full message. format=full returns the MIME tree as a payload.
 */
export async function getMessage(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<gmail_v1.Schema$Message> {
  const res = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });
  return res.data;
}

/**
 * Concurrency-limited fanout. Gmail's per-user quota is generous but we cap to
 * avoid rate-limit errors on bulk fetch.
 */
export async function fetchMessagesInBatches(
  gmail: gmail_v1.Gmail,
  ids: string[],
  concurrency = 10,
): Promise<gmail_v1.Schema$Message[]> {
  const results: gmail_v1.Schema$Message[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const idx = cursor++;
      const id = ids[idx];
      try {
        const msg = await getMessage(gmail, id);
        results.push(msg);
      } catch (err) {
        console.error("getMessage failed", { messageId: id, error: (err as Error).message });
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export interface HistoryChange {
  messageId: string;
  type: "added" | "deleted" | "labelChanged";
}

export async function listHistory(
  gmail: gmail_v1.Gmail,
  startHistoryId: string,
): Promise<{ changes: HistoryChange[]; latestHistoryId: string | null }> {
  const changes: HistoryChange[] = [];
  let pageToken: string | undefined;
  let latestHistoryId: string | null = null;

  do {
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      pageToken,
      historyTypes: ["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"],
    });
    if (res.data.historyId) latestHistoryId = res.data.historyId;
    for (const h of res.data.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (m.message?.id) changes.push({ messageId: m.message.id, type: "added" });
      }
      for (const m of h.messagesDeleted ?? []) {
        if (m.message?.id) changes.push({ messageId: m.message.id, type: "deleted" });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return { changes, latestHistoryId };
}

/**
 * Profile call returns the current historyId — useful as the starting point
 * for incremental sync after the initial backfill.
 */
export async function getCurrentHistoryId(gmail: gmail_v1.Gmail): Promise<string | null> {
  const res = await gmail.users.getProfile({ userId: "me" });
  return res.data.historyId ?? null;
}

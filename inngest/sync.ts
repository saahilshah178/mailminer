import { inngest } from "./client";
import {
  fetchMessagesInBatches,
  getCurrentHistoryId,
  getGmailClient,
  listMessageIds,
} from "@/lib/gmail";
import { parseGmailMessage, buildEmbeddingInput } from "@/lib/email-parser";
import { embedTexts } from "@/lib/embeddings";
import {
  getDecryptedRefreshToken,
  setLastHistoryId,
  setSyncStatus,
} from "@/lib/db/users";
import {
  bulkUpsertEmails,
  getExistingGmailMessageIds,
  updateEmbeddings,
} from "@/lib/db/emails";
import { rebuildThreadsForUser } from "@/lib/db/threads";

const PAGE_SIZE = 500;
const FETCH_CONCURRENCY = 20;

/**
 * Initial backfill — pulls the user's ENTIRE Gmail mailbox (no time cap),
 * including Spam and Trash, so every label view in the app is populated.
 *
 * Triggered by `app/sync.requested`. Runs in steps so retries are durable
 * and progress is observable in the dashboard.
 *
 * Re-running this function for the same user is safe: messages we've already
 * stored are skipped (no Gmail.get + no embedding), so a "resync" cleanly
 * fetches just the missing messages.
 */
export const initialSync = inngest.createFunction(
  {
    id: "initial-sync",
    name: "Initial Gmail sync",
    concurrency: { limit: 5, key: "event.data.userId" },
    retries: 3,
  },
  { event: "app/sync.requested" },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string; mode?: string };
    if (!userId) throw new Error("userId is required");

    await step.run("mark-in-progress", async () => {
      await setSyncStatus(userId, "in_progress", { count: 0, total: 0 });
    });

    const refreshToken = await step.run("load-refresh-token", async () => {
      const token = await getDecryptedRefreshToken(userId);
      if (!token) throw new Error("No refresh token on file for user");
      return token;
    });

    // Capture the latest historyId BEFORE we start paging so incremental sync
    // afterwards can pick up exactly where the backfill left off.
    const baselineHistoryId = await step.run("capture-baseline-history-id", async () => {
      const gmail = getGmailClient(refreshToken);
      return await getCurrentHistoryId(gmail);
    });

    let pageToken: string | null = null;
    let pageIndex = 0;
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalEstimate = 0;

    do {
      const result = await step.run(`fetch-page-${pageIndex}`, async () => {
        const gmail = getGmailClient(refreshToken);
        const page = await listMessageIds(gmail, {
          pageToken: pageToken ?? undefined,
          maxResults: PAGE_SIZE,
          includeSpamTrash: true,
        });
        if (totalEstimate === 0) totalEstimate = page.resultSizeEstimate;

        if (page.ids.length === 0) {
          return { processed: 0, skipped: 0, nextPageToken: page.nextPageToken };
        }

        // Skip messages we already have stored — biggest win for resyncs.
        const existing = await getExistingGmailMessageIds(userId, page.ids);
        const idsToFetch = page.ids.filter((id) => !existing.has(id));
        const skipped = page.ids.length - idsToFetch.length;
        if (idsToFetch.length === 0) {
          return { processed: 0, skipped, nextPageToken: page.nextPageToken };
        }

        const messages = await fetchMessagesInBatches(gmail, idsToFetch, FETCH_CONCURRENCY);
        const parsed = messages
          .map(parseGmailMessage)
          .filter((p): p is NonNullable<typeof p> => Boolean(p));

        const upsertResult = await bulkUpsertEmails(userId, parsed);

        const idByGmailId = new Map(upsertResult.upserted.map((r) => [r.gmail_message_id, r.id]));
        const embedInputs = parsed
          .map((p) => ({
            gmailId: p.gmail_message_id,
            text: buildEmbeddingInput(p),
          }))
          .filter((e) => idByGmailId.has(e.gmailId));

        if (embedInputs.length > 0) {
          const vectors = await embedTexts(embedInputs.map((e) => e.text));
          const rows = embedInputs.map((e, i) => {
            const dbId = idByGmailId.get(e.gmailId)!;
            return { id: dbId, embedding: vectors[i] };
          });
          await updateEmbeddings(userId, rows);
        }

        return {
          processed: parsed.length,
          skipped,
          nextPageToken: page.nextPageToken,
        };
      });

      totalProcessed += result.processed;
      totalSkipped += result.skipped;
      pageToken = result.nextPageToken;
      pageIndex++;

      await step.run(`update-progress-${pageIndex}`, async () => {
        const stored = totalProcessed + totalSkipped;
        await setSyncStatus(userId, "in_progress", {
          count: stored,
          total: Math.max(totalEstimate, stored),
        });
      });
    } while (pageToken);

    await step.run("rebuild-threads", async () => {
      await rebuildThreadsForUser(userId);
    });

    await step.run("persist-history-id", async () => {
      if (baselineHistoryId) await setLastHistoryId(userId, baselineHistoryId);
    });

    await step.run("mark-complete", async () => {
      const stored = totalProcessed + totalSkipped;
      await setSyncStatus(userId, "complete", {
        count: stored,
        total: stored,
      });
    });

    return { userId, processed: totalProcessed, skipped: totalSkipped };
  },
);

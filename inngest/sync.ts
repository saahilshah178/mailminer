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
import { bulkUpsertEmails, updateEmbeddings } from "@/lib/db/emails";
import { rebuildThreadsForUser } from "@/lib/db/threads";

const PAGE_SIZE = 500;
const FETCH_CONCURRENCY = 10;
const TWO_YEARS_DAYS = 730;

/**
 * Initial backfill — capped at the last 2 years per PDD §4.
 *
 * Triggered by `app/sync.requested`. Runs in steps so retries are durable
 * and progress is observable in the dashboard.
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

    const query = `newer_than:${TWO_YEARS_DAYS}d`;

    let pageToken: string | null = null;
    let pageIndex = 0;
    let totalProcessed = 0;
    let totalEstimate = 0;

    do {
      const result = await step.run(`fetch-page-${pageIndex}`, async () => {
        const gmail = getGmailClient(refreshToken);
        const page = await listMessageIds(gmail, {
          pageToken: pageToken ?? undefined,
          query,
          maxResults: PAGE_SIZE,
        });
        if (totalEstimate === 0) totalEstimate = page.resultSizeEstimate;

        if (page.ids.length === 0) {
          return { processed: 0, nextPageToken: page.nextPageToken };
        }
        const messages = await fetchMessagesInBatches(gmail, page.ids, FETCH_CONCURRENCY);
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

        return { processed: parsed.length, nextPageToken: page.nextPageToken };
      });

      totalProcessed += result.processed;
      pageToken = result.nextPageToken;
      pageIndex++;

      await step.run(`update-progress-${pageIndex}`, async () => {
        await setSyncStatus(userId, "in_progress", {
          count: totalProcessed,
          total: Math.max(totalEstimate, totalProcessed),
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
      await setSyncStatus(userId, "complete", {
        count: totalProcessed,
        total: totalProcessed,
      });
    });

    return { userId, processed: totalProcessed };
  },
);

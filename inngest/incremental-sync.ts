import { inngest } from "./client";
import {
  fetchMessagesInBatches,
  getCurrentHistoryId,
  getGmailClient,
  listHistory,
} from "@/lib/gmail";
import { parseGmailMessage, buildEmbeddingInput } from "@/lib/email-parser";
import { embedTexts } from "@/lib/embeddings";
import {
  getDecryptedRefreshToken,
  getUserById,
  listActiveUserIds,
  setLastHistoryId,
} from "@/lib/db/users";
import {
  bulkUpsertEmails,
  deleteEmailsByGmailIds,
  updateEmbeddings,
} from "@/lib/db/emails";
import { rebuildThreadsForUser } from "@/lib/db/threads";

/**
 * Per-user incremental sync. Driven by Gmail's historyId — pulls only changes
 * since the last successful run.
 */
export const incrementalSyncForUser = inngest.createFunction(
  {
    id: "incremental-sync-user",
    name: "Incremental sync (per user)",
    concurrency: { limit: 1, key: "event.data.userId" },
    retries: 3,
  },
  { event: "app/sync.incremental.requested" },
  async ({ event, step }) => {
    const { userId } = event.data as { userId: string };
    if (!userId) throw new Error("userId is required");

    const user = await step.run("load-user", async () => getUserById(userId));
    if (!user || user.sync_status !== "complete") {
      return { userId, skipped: true, reason: "user not ready" };
    }

    const refreshToken = await step.run("load-refresh-token", async () => {
      const t = await getDecryptedRefreshToken(userId);
      if (!t) throw new Error("missing refresh token");
      return t;
    });

    const result = await step.run("apply-history", async () => {
      const gmail = getGmailClient(refreshToken);
      if (!user.last_history_id) {
        const newHistory = await getCurrentHistoryId(gmail);
        return { added: 0, deleted: 0, relabeled: 0, latestHistoryId: newHistory };
      }
      const { changes, latestHistoryId } = await listHistory(gmail, user.last_history_id);
      const addedIds = Array.from(
        new Set(changes.filter((c) => c.type === "added").map((c) => c.messageId)),
      );
      const deletedIds = Array.from(
        new Set(changes.filter((c) => c.type === "deleted").map((c) => c.messageId)),
      );
      // Re-fetch label-changed messages so their `labels` (and the derived
      // `category` column) stay current. Skip ones that are already in the
      // added/deleted sets — those are already covered.
      const addedSet = new Set(addedIds);
      const deletedSet = new Set(deletedIds);
      const relabeledIds = Array.from(
        new Set(
          changes
            .filter((c) => c.type === "labelChanged")
            .map((c) => c.messageId)
            .filter((id) => !addedSet.has(id) && !deletedSet.has(id)),
        ),
      );

      if (addedIds.length > 0) {
        const messages = await fetchMessagesInBatches(gmail, addedIds, 8);
        const parsed = messages
          .map(parseGmailMessage)
          .filter((p): p is NonNullable<typeof p> => Boolean(p));
        const upsertResult = await bulkUpsertEmails(userId, parsed);
        const idByGmailId = new Map(upsertResult.upserted.map((r) => [r.gmail_message_id, r.id]));
        const embedInputs = parsed
          .map((p) => ({ gmailId: p.gmail_message_id, text: buildEmbeddingInput(p) }))
          .filter((e) => idByGmailId.has(e.gmailId));
        if (embedInputs.length > 0) {
          const vectors = await embedTexts(embedInputs.map((e) => e.text));
          const rows = embedInputs.map((e, i) => ({
            id: idByGmailId.get(e.gmailId)!,
            embedding: vectors[i],
          }));
          await updateEmbeddings(userId, rows);
        }
      }
      if (relabeledIds.length > 0) {
        // Body / headers haven't changed, so we re-upsert (which refreshes
        // `labels` → triggers regeneration of `category`) but skip the
        // expensive embed step.
        const messages = await fetchMessagesInBatches(gmail, relabeledIds, 8);
        const parsed = messages
          .map(parseGmailMessage)
          .filter((p): p is NonNullable<typeof p> => Boolean(p));
        if (parsed.length > 0) {
          await bulkUpsertEmails(userId, parsed);
        }
      }
      if (deletedIds.length > 0) {
        await deleteEmailsByGmailIds(userId, deletedIds);
      }

      return {
        added: addedIds.length,
        deleted: deletedIds.length,
        relabeled: relabeledIds.length,
        latestHistoryId,
      };
    });

    if (result.added > 0 || result.deleted > 0 || result.relabeled > 0) {
      await step.run("rebuild-threads", async () => rebuildThreadsForUser(userId));
    }
    if (result.latestHistoryId) {
      await step.run("persist-history-id", async () =>
        setLastHistoryId(userId, result.latestHistoryId!),
      );
    }
    return { userId, ...result };
  },
);

/**
 * Cron fan-out — every 15 minutes, fan out an `app/sync.incremental.requested`
 * for each active user.
 */
export const incrementalSyncCron = inngest.createFunction(
  { id: "incremental-sync-cron", name: "Incremental sync (cron fan-out)" },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const userIds = await step.run("list-active-users", async () => listActiveUserIds());
    if (userIds.length === 0) return { triggered: 0 };
    await step.sendEvent(
      "fan-out",
      userIds.map((userId) => ({
        name: "app/sync.incremental.requested",
        data: { userId },
      })),
    );
    return { triggered: userIds.length };
  },
);

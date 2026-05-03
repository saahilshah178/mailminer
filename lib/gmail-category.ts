/**
 * Gmail tab category derivation.
 *
 * Gmail tags every message in INBOX with at most one `CATEGORY_*` label
 * corresponding to which tab it appears under. The actual API label IDs are:
 *   * Primary    → `CATEGORY_PERSONAL`   ← NOT "CATEGORY_PRIMARY"
 *   * Social     → `CATEGORY_SOCIAL`
 *   * Promotions → `CATEGORY_PROMOTIONS`
 *   * Updates    → `CATEGORY_UPDATES`
 *   * Forums     → `CATEGORY_FORUMS`
 * Older messages, sent items, and drafts may carry no category at all → "none".
 *
 * This helper is the single source of truth used by both the ingestion path
 * (writing the derived value into the `emails.category` column) and the UI
 * (any non-DB call site that needs to bucket a message by tab).
 *
 * Mirrors the `public.gmail_category_from_labels` Postgres function — keep
 * them in lockstep.
 */

export type GmailCategory =
  | "primary"
  | "social"
  | "promotions"
  | "updates"
  | "forums"
  | "none";

export const GMAIL_CATEGORIES: readonly GmailCategory[] = [
  "primary",
  "social",
  "promotions",
  "updates",
  "forums",
  "none",
] as const;

export function deriveGmailCategory(labelIds: readonly string[] | null | undefined): GmailCategory {
  if (!labelIds || labelIds.length === 0) return "none";
  if (labelIds.includes("CATEGORY_PERSONAL")) return "primary";
  if (labelIds.includes("CATEGORY_SOCIAL")) return "social";
  if (labelIds.includes("CATEGORY_PROMOTIONS")) return "promotions";
  if (labelIds.includes("CATEGORY_UPDATES")) return "updates";
  if (labelIds.includes("CATEGORY_FORUMS")) return "forums";
  return "none";
}

/**
 * Per-message Primary/Other tab classification.
 *
 * Spec (applied to the message's `labels` array):
 *   1. If `INBOX` is not present → message is not in either inbox tab
 *      (it lives under SENT / SPAM / etc. in the sidebar instead).
 *   2. INBOX + `IMPORTANT` → primary (importance overrides category).
 *   3. INBOX + `CATEGORY_PERSONAL` (and no IMPORTANT) → primary.
 *   4. INBOX otherwise → other.
 *
 * For thread aggregation, callers should apply this to the *latest INBOX
 * message* in the thread.
 *
 * Mirrors `public.inbox_tab_for_labels` in SQL — keep them in lockstep.
 */
import type { InboxTab } from "@/lib/inbox-labels";

export function classifyInboxTab(labels: readonly string[] | null | undefined): InboxTab | null {
  if (!labels || labels.length === 0) return null;
  if (!labels.includes("INBOX")) return null;
  if (labels.includes("IMPORTANT")) return "primary";
  if (labels.includes("CATEGORY_PERSONAL")) return "primary";
  return "other";
}

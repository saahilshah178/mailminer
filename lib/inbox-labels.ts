export interface InboxView {
  /** URL slug (after /inbox/...) */
  slug: string;
  /** Gmail label, or null if the view doesn't map to a label (e.g. "snoozed"). */
  gmailLabel: string | null;
  /** Heading shown above the list. */
  title: string;
  /** Empty-state caption. */
  emptyHint: string;
}

export const DEFAULT_INBOX_VIEW: InboxView = {
  slug: "",
  gmailLabel: "INBOX",
  title: "Inbox",
  emptyHint: "Nothing in your inbox right now. Newly synced messages will appear here.",
};

const VIEWS: Record<string, InboxView> = {
  starred: {
    slug: "starred",
    gmailLabel: "STARRED",
    title: "Starred",
    emptyHint: "Star messages to find them quickly later.",
  },
  snoozed: {
    slug: "snoozed",
    gmailLabel: null,
    title: "Snoozed",
    emptyHint: "Snoozed messages will appear here.",
  },
  sent: {
    slug: "sent",
    gmailLabel: "SENT",
    title: "Sent",
    emptyHint: "Messages you've sent will appear here.",
  },
  drafts: {
    slug: "drafts",
    gmailLabel: "DRAFT",
    title: "Drafts",
    emptyHint: "You haven't started any drafts.",
  },
  important: {
    slug: "important",
    gmailLabel: "IMPORTANT",
    title: "Important",
    emptyHint: "Gmail hasn't flagged anything as important yet.",
  },
  spam: {
    slug: "spam",
    gmailLabel: "SPAM",
    title: "Spam",
    emptyHint: "No spam — nice.",
  },
  trash: {
    slug: "trash",
    gmailLabel: "TRASH",
    title: "Trash",
    emptyHint: "Trash is empty.",
  },
  social: {
    slug: "social",
    gmailLabel: "CATEGORY_SOCIAL",
    title: "Social",
    emptyHint: "Notifications from social networks land here.",
  },
  updates: {
    slug: "updates",
    gmailLabel: "CATEGORY_UPDATES",
    title: "Updates",
    emptyHint: "Confirmations, receipts, and statements live here.",
  },
  forums: {
    slug: "forums",
    gmailLabel: "CATEGORY_FORUMS",
    title: "Forums",
    emptyHint: "Mailing lists and discussion groups appear here.",
  },
  promotions: {
    slug: "promotions",
    gmailLabel: "CATEGORY_PROMOTIONS",
    title: "Promotions",
    emptyHint: "Marketing emails will collect here.",
  },
};

export function getInboxView(slug: string | undefined | null): InboxView | null {
  if (!slug) return DEFAULT_INBOX_VIEW;
  return VIEWS[slug] ?? null;
}

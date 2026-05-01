import { z } from "zod";

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(1000),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const FeedbackRequestSchema = z.object({
  queryId: z.string().uuid(),
  feedback: z.enum(["helpful", "not_helpful"]),
});
export type FeedbackRequest = z.infer<typeof FeedbackRequestSchema>;

export const SyncStartSchema = z.object({}).passthrough();

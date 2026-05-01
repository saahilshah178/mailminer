import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "inbox-ai",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

export type SyncRequestedEvent = {
  name: "app/sync.requested";
  data: { userId: string; mode?: "initial" | "incremental" };
};

export type Events = {
  "app/sync.requested": SyncRequestedEvent;
};

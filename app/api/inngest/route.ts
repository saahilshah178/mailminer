import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { initialSync } from "@/inngest/sync";
import { incrementalSyncCron, incrementalSyncForUser } from "@/inngest/incremental-sync";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [initialSync, incrementalSyncForUser, incrementalSyncCron],
});

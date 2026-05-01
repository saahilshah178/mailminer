"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelativeDate } from "@/lib/utils";
import type { SearchCitation } from "@/types";

export interface EmailCardProps {
  citation: SearchCitation;
  index: number;
  threadDbId?: string;
}

export function EmailCard({ citation, index, threadDbId }: EmailCardProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card id={`email-${citation.id}`} className="scroll-mt-20">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                [{index}]
              </span>
              <span className="truncate">
                {citation.from_name ?? citation.from_address ?? "Unknown sender"}
              </span>
              <span className="text-muted-foreground">·</span>
              <span>{formatRelativeDate(citation.date)}</span>
            </div>
            <div className="mt-1 line-clamp-1 font-medium">
              {citation.subject ?? "(no subject)"}
            </div>
          </div>
          {threadDbId && (
            <Link
              href={`/thread/${threadDbId}`}
              className="shrink-0 text-xs text-primary hover:underline"
            >
              Open thread
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="block w-full text-left text-sm text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-foreground">
              {citation.snippet}
            </pre>
          ) : (
            <span className="line-clamp-2">{citation.snippet}</span>
          )}
        </button>
      </CardContent>
    </Card>
  );
}

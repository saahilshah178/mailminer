"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmailCard } from "@/components/email-card";
import type { SearchResult } from "@/types";

export function AnswerDisplay({ result }: { result: SearchResult }) {
  const [feedback, setFeedback] = useState<"helpful" | "not_helpful" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submitFeedback(value: "helpful" | "not_helpful") {
    if (submitting || feedback) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryId: result.queryId, feedback: value }),
      });
      if (res.ok) setFeedback(value);
    } catch (err) {
      console.error("feedback submit failed", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="whitespace-pre-wrap text-base leading-relaxed">{result.answer}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Was this helpful?</span>
            <Button
              variant={feedback === "helpful" ? "default" : "ghost"}
              size="icon"
              disabled={submitting || feedback !== null}
              onClick={() => submitFeedback("helpful")}
              aria-label="Helpful"
            >
              <ThumbsUp className="h-4 w-4" />
            </Button>
            <Button
              variant={feedback === "not_helpful" ? "default" : "ghost"}
              size="icon"
              disabled={submitting || feedback !== null}
              onClick={() => submitFeedback("not_helpful")}
              aria-label="Not helpful"
            >
              <ThumbsDown className="h-4 w-4" />
            </Button>
            {feedback && <span className="text-xs">Thanks for the feedback.</span>}
          </div>
        </CardContent>
      </Card>

      {result.citations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Sources
          </h3>
          <div className="space-y-2">
            {result.citations.map((c, i) => (
              <EmailCard key={c.id} citation={c} index={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

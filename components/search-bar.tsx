"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AnswerDisplay } from "@/components/answer-display";
import type { SearchResult } from "@/types";

export interface SearchBarProps {
  initialQuery?: string;
}

export function SearchBar({ initialQuery = "" }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Search failed");
      }
      const data = (await res.json()) as SearchResult;
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function runExample(text: string) {
    setQuery(text);
    setTimeout(() => {
      const form = document.getElementById("search-form") as HTMLFormElement | null;
      form?.requestSubmit();
    }, 0);
  }

  return (
    <div className="space-y-6">
      <form id="search-form" onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask anything about your emails..."
          className="h-12 text-base"
          autoFocus
          disabled={loading}
        />
        <Button type="submit" size="lg" disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Ask"}
        </Button>
      </form>

      <ExampleQueries onPick={runExample} disabled={loading} />

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {result && !loading && <AnswerDisplay result={result} />}
    </div>
  );
}

const EXAMPLES = [
  "What's the latest from my landlord?",
  "When does my Costco membership renew?",
  "Did anyone send me their address recently?",
  "What was that book my friend recommended?",
];

function ExampleQueries({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {EXAMPLES.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          disabled={disabled}
          className="rounded-full border border-input bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

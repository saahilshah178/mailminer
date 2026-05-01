import { Card, CardContent } from "@/components/ui/card";

export function ThreadSummary({ summary }: { summary: string }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Summary
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</p>
      </CardContent>
    </Card>
  );
}

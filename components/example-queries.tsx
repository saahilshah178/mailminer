export const EXAMPLE_QUERIES = [
  "What's the latest from my landlord?",
  "When does my Costco membership renew?",
  "Did anyone send me their address recently?",
  "What was that book my friend recommended?",
];

export function ExampleQueries() {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Try asking
      </h3>
      <div className="flex flex-wrap gap-2">
        {EXAMPLE_QUERIES.map((q) => (
          <span
            key={q}
            className="rounded-full border border-input bg-background px-3 py-1.5 text-xs text-muted-foreground"
          >
            {q}
          </span>
        ))}
      </div>
    </div>
  );
}

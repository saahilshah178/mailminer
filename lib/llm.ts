import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { QueryFilters } from "@/types";

const SONNET = "claude-sonnet-4-5";
const HAIKU = "claude-haiku-4-5";

let cached: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (cached) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  cached = new Anthropic({ apiKey });
  return cached;
}

function extractTextFromResponse(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/**
 * Use a fast small model to pull structured filters out of a free-text query.
 * Returns an empty object when no filters can be confidently extracted.
 */
export async function extractFilters(query: string): Promise<QueryFilters> {
  const client = getAnthropic();
  const today = new Date().toISOString().slice(0, 10);
  const sys = `You extract structured search filters from natural-language email queries.
Today is ${today}.
Return ONLY valid JSON with this shape (omit any field that isn't clearly implied):
{
  "dateFrom": "YYYY-MM-DD",
  "dateTo": "YYYY-MM-DD",
  "senderDomain": "example.com",
  "hasAttachments": true | false
}
If nothing applies, return {}.`;

  try {
    const res = await client.messages.create({
      model: HAIKU,
      max_tokens: 256,
      system: sys,
      messages: [{ role: "user", content: query }],
    });
    const text = extractTextFromResponse(res.content).trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return {};
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
    const out: QueryFilters = {};
    if (typeof parsed.dateFrom === "string") out.dateFrom = parsed.dateFrom;
    if (typeof parsed.dateTo === "string") out.dateTo = parsed.dateTo;
    if (typeof parsed.senderDomain === "string") out.senderDomain = parsed.senderDomain;
    if (typeof parsed.hasAttachments === "boolean") out.hasAttachments = parsed.hasAttachments;
    return out;
  } catch (err) {
    console.error("extractFilters failed", { error: (err as Error).message });
    return {};
  }
}

export interface SynthesisEmail {
  id: string;
  from_name: string | null;
  from_address: string | null;
  date: string | null;
  subject: string | null;
  body_text: string | null;
}

/**
 * Synthesize a cited answer from the top retrieved emails.
 * The model is instructed to cite by [n] referencing the order of `emails`.
 */
export async function synthesizeAnswer(
  query: string,
  emails: SynthesisEmail[],
): Promise<string> {
  if (emails.length === 0) {
    return "I couldn't find that information in your inbox. Try rephrasing or being more specific.";
  }
  const client = getAnthropic();
  const blocks = emails
    .map((e, i) => {
      const body = (e.body_text ?? "").slice(0, 2000);
      return `[Email ${i + 1}] (id: ${e.id})
From: ${e.from_name ?? ""} <${e.from_address ?? ""}>
Date: ${e.date ?? ""}
Subject: ${e.subject ?? ""}
Body: ${body}
---`;
    })
    .join("\n");

  const userMsg = `The user asked: "${query}"

Here are the most relevant emails from their inbox, sorted by relevance:

${blocks}

Answer the user's question using only these emails. Cite which emails you used in your answer like [1], [2]. If the answer isn't in these emails, say "I couldn't find that information in your inbox" and suggest a different query.

Be concise. Don't repeat the question. Don't add commentary.`;

  const res = await client.messages.create({
    model: SONNET,
    max_tokens: 1024,
    system:
      "You are an assistant that helps users find information in their email. Always cite your sources using [n] notation matching the email order. Keep answers concise and factual.",
    messages: [{ role: "user", content: userMsg }],
  });
  return extractTextFromResponse(res.content).trim();
}

export async function summarizeEmail(args: {
  subject: string | null;
  from: string | null;
  body: string | null;
}): Promise<string> {
  const client = getAnthropic();
  const res = await client.messages.create({
    model: HAIKU,
    max_tokens: 120,
    system: "Summarize emails in one short sentence (under 20 words). No preamble.",
    messages: [
      {
        role: "user",
        content: `From: ${args.from ?? ""}
Subject: ${args.subject ?? ""}
Body: ${(args.body ?? "").slice(0, 2000)}`,
      },
    ],
  });
  return extractTextFromResponse(res.content).trim();
}

export interface ThreadSummaryEmail {
  from_name: string | null;
  from_address: string | null;
  date: string | null;
  body_text: string | null;
}

export async function summarizeThread(
  subject: string | null,
  emails: ThreadSummaryEmail[],
): Promise<string> {
  const client = getAnthropic();
  const transcript = emails
    .map(
      (e, i) =>
        `Message ${i + 1} - ${e.from_name ?? ""} <${e.from_address ?? ""}> at ${e.date ?? ""}:
${(e.body_text ?? "").slice(0, 1500)}`,
    )
    .join("\n\n");

  const promptForLong = emails.length >= 10
    ? "\n\nAfter the summary, add a 'Key points:' section as a short bulleted list of the most important specifics."
    : "";

  const res = await client.messages.create({
    model: SONNET,
    max_tokens: 600,
    system:
      "You summarize email threads. Be concise: 2-4 sentences capturing the gist, decisions made, and any open questions. No preamble.",
    messages: [
      {
        role: "user",
        content: `Thread subject: ${subject ?? "(no subject)"}

${transcript}${promptForLong}`,
      },
    ],
  });
  return extractTextFromResponse(res.content).trim();
}

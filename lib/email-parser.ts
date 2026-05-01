import EmailReplyParser from "email-reply-parser";
import type { gmail_v1 } from "googleapis";
import type { ParsedEmail } from "@/types";

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

interface PartWalkResult {
  text: string | null;
  html: string | null;
  hasAttachments: boolean;
}

function walkParts(part: gmail_v1.Schema$MessagePart | undefined, acc: PartWalkResult): void {
  if (!part) return;
  const mime = part.mimeType ?? "";
  const filename = part.filename ?? "";
  if (filename.length > 0 && part.body?.attachmentId) {
    acc.hasAttachments = true;
  }
  if (part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (mime.startsWith("text/plain") && acc.text === null) {
      acc.text = decoded;
    } else if (mime.startsWith("text/html") && acc.html === null) {
      acc.html = decoded;
    }
  }
  for (const sub of part.parts ?? []) {
    walkParts(sub, acc);
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/?[^>]+(>|$)/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSignature(text: string): string {
  const lines = text.split("\n");
  const sigIdx = lines.findIndex((line) => /^-{2,}\s*$/.test(line.trim()));
  if (sigIdx >= 0) return lines.slice(0, sigIdx).join("\n").trim();
  return text;
}

export function cleanBody(rawText: string): string {
  const parser = new EmailReplyParser();
  const visible = parser.read(rawText).getVisibleText();
  return stripSignature(visible).trim();
}

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  const h = headers.find((header) => (header.name ?? "").toLowerCase() === target);
  return h?.value ?? null;
}

function parseAddressList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface ParsedAddress {
  email: string;
  name: string | null;
}

function parseAddress(value: string | null): ParsedAddress | null {
  if (!value) return null;
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = (match[1] ?? "").trim();
    return { email: (match[2] ?? "").trim(), name: name.length > 0 ? name : null };
  }
  return { email: value.trim(), name: null };
}

export function parseGmailMessage(msg: gmail_v1.Schema$Message): ParsedEmail | null {
  if (!msg.id) return null;
  const headers = msg.payload?.headers ?? [];
  const subject = getHeader(headers, "Subject");
  const fromRaw = getHeader(headers, "From");
  const toRaw = getHeader(headers, "To");
  const ccRaw = getHeader(headers, "Cc");
  const dateRaw = getHeader(headers, "Date");

  const from = parseAddress(fromRaw);
  const to = parseAddressList(toRaw)
    .map(parseAddress)
    .filter((a): a is ParsedAddress => Boolean(a))
    .map((a) => a.email);
  const cc = parseAddressList(ccRaw)
    .map(parseAddress)
    .filter((a): a is ParsedAddress => Boolean(a))
    .map((a) => a.email);

  const acc: PartWalkResult = { text: null, html: null, hasAttachments: false };
  walkParts(msg.payload, acc);

  let bodyRaw = acc.text ?? (acc.html ? stripHtml(acc.html) : "");
  if (msg.payload?.body?.data && !bodyRaw) {
    bodyRaw = decodeBase64Url(msg.payload.body.data);
  }
  const cleaned = cleanBody(bodyRaw);

  let dateIso: string | null = null;
  if (msg.internalDate) {
    dateIso = new Date(parseInt(msg.internalDate, 10)).toISOString();
  } else if (dateRaw) {
    const d = new Date(dateRaw);
    if (!Number.isNaN(d.getTime())) dateIso = d.toISOString();
  }

  return {
    gmail_message_id: msg.id,
    thread_id: msg.threadId ?? msg.id,
    subject,
    from_address: from?.email ?? null,
    from_name: from?.name ?? null,
    to_addresses: to,
    cc_addresses: cc,
    date: dateIso,
    body_text: cleaned,
    has_attachments: acc.hasAttachments,
    labels: msg.labelIds ?? [],
  };
}

/**
 * Build the embedding input. Per PDD: subject + sender name + first 1000 chars
 * of body. Keeps the signal tight and the cost low.
 */
export function buildEmbeddingInput(email: ParsedEmail): string {
  const parts: string[] = [];
  if (email.subject) parts.push(`Subject: ${email.subject}`);
  if (email.from_name || email.from_address) {
    parts.push(`From: ${email.from_name ?? ""} <${email.from_address ?? ""}>`.trim());
  }
  if (email.body_text) parts.push(email.body_text.slice(0, 1000));
  return parts.join("\n");
}

import "server-only";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;
const BATCH_SIZE = 100;

let cached: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  cached = new OpenAI({ apiKey });
  return cached;
}

/**
 * Embed many strings at once. Returns vectors in the same order as input.
 * Batched at BATCH_SIZE to stay well below the 2048 limit and keep retries cheap.
 */
export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const client = getOpenAI();
  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const res = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    if (res.data.length !== batch.length) {
      throw new Error(
        `Embedding count mismatch: requested ${batch.length}, received ${res.data.length}`,
      );
    }
    for (const item of res.data) {
      out.push(item.embedding);
    }
  }
  return out;
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vec] = await embedTexts([query]);
  if (!vec || vec.length !== EMBEDDING_DIMS) {
    throw new Error("Embedding query returned no vector");
  }
  return vec;
}

export const EMBEDDING_DIMENSIONS = EMBEDDING_DIMS;

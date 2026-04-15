import { db } from '../config/database.js';
import { knowledgeEmbeddings } from '../db/schema/embeddings.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { generateEmbedding, cosineSimilarity } from './embeddings.js';
import { env } from '../config/env.js';

function resolveEmbeddingModel(): string {
  if (env.GEMINI_API_KEY) return 'gemini-embedding-2-preview';
  if (env.OPENAI_API_KEY) return 'text-embedding-3-small';
  return 'hash-fallback';
}

// Store a knowledge chunk with embedding
export async function storeKnowledge(opts: {
  userId: string;
  botId?: string;
  sourceType: string;
  sourceId?: string;
  content: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}) {
  const embedding = await generateEmbedding(opts.content);

  const [row] = await db.insert(knowledgeEmbeddings).values({
    userId: opts.userId,
    botId: opts.botId || null,
    sourceType: opts.sourceType,
    sourceId: opts.sourceId,
    content: opts.content,
    summary: opts.summary,
    embedding,
    embeddingModel: resolveEmbeddingModel(),
    metadata: opts.metadata || {},
  }).returning();

  return row;
}

// Retrieve relevant knowledge for a user query
export async function retrieveKnowledge(opts: {
  userId: string;
  botId?: string;
  query: string;
  topK?: number;
}): Promise<Array<{ content: string; summary: string | null; sourceType: string; score: number }>> {
  const topK = opts.topK || 5;
  const queryEmbedding = await generateEmbedding(opts.query);

  // RAG isolation:
  //   With botId  → return that bot's rows + user-level rows (botId IS NULL)
  //   Without botId → return ONLY user-level rows (botId IS NULL) so bot training
  //                   data never bleeds into the general chatbot
  const whereClause = opts.botId
    ? and(
        eq(knowledgeEmbeddings.userId, opts.userId),
        sql`(${knowledgeEmbeddings.botId} = ${opts.botId} OR ${knowledgeEmbeddings.botId} IS NULL)`,
      )
    : and(
        eq(knowledgeEmbeddings.userId, opts.userId),
        sql`${knowledgeEmbeddings.botId} IS NULL`,
      );

  const rows = await db
    .select({
      content: knowledgeEmbeddings.content,
      summary: knowledgeEmbeddings.summary,
      sourceType: knowledgeEmbeddings.sourceType,
      embedding: knowledgeEmbeddings.embedding,
    })
    .from(knowledgeEmbeddings)
    .where(whereClause)
    .orderBy(desc(knowledgeEmbeddings.createdAt))
    .limit(200);

  // Rank by cosine similarity (only compare same-dimension embeddings)
  const queryDims = queryEmbedding.length;
  const scored = rows
    .filter(r => r.embedding && Array.isArray(r.embedding) && (r.embedding as number[]).length === queryDims)
    .map(r => ({
      content: r.content,
      summary: r.summary,
      sourceType: r.sourceType,
      score: cosineSimilarity(queryEmbedding, r.embedding as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // Return if similarity is above threshold (0.2 for Gemini embeddings)
  return scored.filter(s => s.score > 0.2);
}

// Store multiple chunks from a training document
export async function storeTrainingChunks(opts: {
  userId: string;
  botId?: string;
  sourceType: string;
  sourceId: string;
  text: string;
  metadata?: Record<string, unknown>;
}) {
  // Split text into chunks of ~500 chars with overlap
  const chunks = chunkText(opts.text, 500, 50);

  for (const chunk of chunks) {
    await storeKnowledge({
      userId: opts.userId,
      botId: opts.botId,
      sourceType: opts.sourceType,
      sourceId: opts.sourceId,
      content: chunk,
      metadata: opts.metadata,
    });
  }

  return chunks.length;
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end).trim());
    start += chunkSize - overlap;
  }
  return chunks.filter(c => c.length > 20); // skip tiny chunks
}

import { env } from '../config/env.js';
// Embedding priority:
// 1. Gemini text-embedding-004 (FREE — 1,500 req/day)
// 2. OpenAI text-embedding-3-small (paid — $0.02/1M tokens)
// 3. Fake hash-based embedding (offline fallback)
export async function generateEmbedding(text) {
    const input = text.substring(0, 8000).trim();
    if (!input)
        return fakeEmbedding('empty');
    // Try Gemini first (free)
    if (env.GEMINI_API_KEY) {
        try {
            return await geminiEmbedding(input);
        }
        catch (err) {
            console.warn('[Embeddings] Gemini failed, falling back:', err.message);
        }
    }
    // Try OpenAI second (paid)
    if (env.OPENAI_API_KEY) {
        try {
            return await openaiEmbedding(input);
        }
        catch (err) {
            console.warn('[Embeddings] OpenAI failed, falling back:', err.message);
        }
    }
    // Fallback: deterministic hash-based embedding
    return fakeEmbedding(input);
}
// Gemini text-embedding-004 — FREE tier: 1,500 requests/day
async function geminiEmbedding(text) {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const response = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: text,
    });
    const embedding = response.embedding?.values ?? response.embeddings?.[0]?.values;
    if (!embedding || embedding.length === 0) {
        throw new Error('Empty embedding response from Gemini');
    }
    return embedding;
}
// OpenAI text-embedding-3-small — $0.02/1M tokens
async function openaiEmbedding(text) {
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 768, // match Gemini's dimension for consistency
    });
    return response.data[0].embedding;
}
// Deterministic hash-based fake embedding (offline fallback)
function fakeEmbedding(text) {
    const dims = 768; // match Gemini's 768 dimensions
    const result = new Array(dims).fill(0);
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        result[i % dims] += code / 1000;
        result[(i * 7 + 3) % dims] += Math.sin(code * 0.1) * 0.5;
    }
    const mag = Math.sqrt(result.reduce((s, v) => s + v * v, 0)) || 1;
    return result.map(v => v / mag);
}
// Cosine similarity between two vectors
export function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        // Different dimensions — can't compare, return low score
        return 0;
    }
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { env } from './env.js';
import { AppError } from '../lib/errors.js';

// Convert local /uploads/... path to base64 data URI
function resolveImageToBase64(imageUrl: string): { base64: string; mimeType: string } | null {
  try {
    let filePath = imageUrl;
    if (filePath.startsWith('/uploads/')) {
      filePath = path.join(process.cwd(), filePath);
    }
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
      '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    };
    const mimeType = mimeMap[ext] || 'image/jpeg';
    return { base64: buffer.toString('base64'), mimeType };
  } catch {
    return null;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type LLMProvider = 'anthropic' | 'gemini' | 'openai';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
  imageUrl?: string;
}

export interface LLMResponse {
  text: string;
  provider: LLMProvider;
  model: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

// ─── Provider Clients (lazy-initialized) ────────────────────────────────────

let _anthropic: Anthropic | null = null;
let _gemini: GoogleGenAI | null = null;
let _openai: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _anthropic;
}

function getGeminiClient(): GoogleGenAI {
  if (!_gemini) _gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return _gemini;
}

function getOpenAIClient(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _openai;
}

// ─── Default Models ─────────────────────────────────────────────────────────

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4.1', // Best OpenAI model — primary for all chatbot calls
};

// ─── Provider Resolution ────────────────────────────────────────────────────

function resolveProvider(): LLMProvider {
  if (env.AI_PROVIDER !== 'auto') {
    return env.AI_PROVIDER as LLMProvider;
  }
  // Auto: OpenAI is always the first choice, Gemini as fallback, Anthropic last
  if (env.OPENAI_API_KEY) return 'openai';
  if (env.GEMINI_API_KEY) return 'gemini';
  if (env.ANTHROPIC_API_KEY) return 'anthropic';

  throw new AppError(
    503,
    'No AI provider configured. Set at least one API key: OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY.',
    'AI_UNAVAILABLE',
  );
}

// ─── Retry Helper ────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 2000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      // Don't retry on hard errors (auth, content policy, etc.)
      const msg = (err?.message || '').toLowerCase();
      const isRetryable =
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.includes('network') ||
        msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('rate limit') ||
        msg.includes('overloaded') ||
        msg.includes('503') ||
        msg.includes('529') ||
        (err?.status >= 500 && err?.status < 600);
      if (!isRetryable || attempt === maxRetries) break;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[AI] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, msg);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function getModelForProvider(provider: LLMProvider): string {
  if (env.AI_MODEL) return env.AI_MODEL;
  return DEFAULT_MODELS[provider];
}

function ensureKeyForProvider(provider: LLMProvider): void {
  const keys: Record<LLMProvider, string> = {
    anthropic: env.ANTHROPIC_API_KEY,
    gemini: env.GEMINI_API_KEY,
    openai: env.OPENAI_API_KEY,
  };
  if (!keys[provider]) {
    throw new AppError(
      503,
      `AI provider "${provider}" selected but its API key is not configured.`,
      'AI_UNAVAILABLE',
    );
  }
}

// ─── Provider Implementations ───────────────────────────────────────────────

async function callAnthropic(
  messages: LLMMessage[],
  opts: LLMOptions,
  model: string,
): Promise<LLMResponse> {
  const client = getAnthropicClient();

  const apiMessages: Anthropic.MessageParam[] = messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'user' && opts.imageUrl) {
        const imgData = resolveImageToBase64(opts.imageUrl);
        if (imgData) {
          return {
            role: 'user' as const,
            content: [
              { type: 'text' as const, text: m.content },
              { type: 'image' as const, source: { type: 'base64' as const, media_type: imgData.mimeType as any, data: imgData.base64 } },
            ],
          };
        }
        return { role: 'user' as const, content: m.content };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content };
    });

  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: apiMessages,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
  return {
    text,
    provider: 'anthropic',
    model,
    usage: {
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    },
  };
}

async function callGemini(
  messages: LLMMessage[],
  opts: LLMOptions,
  model: string,
): Promise<LLMResponse> {
  const client = getGeminiClient();

  // Build contents for Gemini
  const systemInstruction = opts.system;
  const contents: Array<{ role: string; parts: Array<any> }> = [];

  for (const m of messages) {
    if (m.role === 'system') continue;
    const parts: any[] = [{ text: m.content }];

    // Add image for user messages
    if (m.role === 'user' && opts.imageUrl) {
      const imgData = resolveImageToBase64(opts.imageUrl);
      if (imgData) {
        parts.push({
          inlineData: { mimeType: imgData.mimeType, data: imgData.base64 },
        });
      }
    }

    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    });
  }

  const response = await client.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemInstruction || undefined,
      maxOutputTokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature,
    },
  });

  const text = response.text ?? '';
  return {
    text,
    provider: 'gemini',
    model,
    usage: {
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    },
  };
}

async function callOpenAI(
  messages: LLMMessage[],
  opts: LLMOptions,
  model: string,
): Promise<LLMResponse> {
  const client = getOpenAIClient();

  const apiMessages: OpenAI.ChatCompletionMessageParam[] = [];
  if (opts.system) {
    apiMessages.push({ role: 'system', content: opts.system });
  }
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'user' && opts.imageUrl) {
      const imgB64 = resolveImageToBase64(opts.imageUrl);
      const imgUrl = imgB64 ? `data:${imgB64.mimeType};base64,${imgB64.base64}` : opts.imageUrl;
      apiMessages.push({
        role: 'user',
        content: [
          { type: 'text', text: m.content },
          { type: 'image_url', image_url: { url: imgUrl } },
        ],
      });
    } else {
      apiMessages.push({ role: m.role, content: m.content });
    }
  }

  const response = await client.chat.completions.create({
    model,
    messages: apiMessages,
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
  });

  const text = response.choices[0]?.message?.content ?? '';
  return {
    text,
    provider: 'openai',
    model,
    usage: {
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    },
  };
}

// ─── Unified Interface ─────────────────────────────────────────────────────

/**
 * Send a message to the configured LLM provider.
 * OpenAI is tried first (with retry), then Gemini as fallback, then Anthropic.
 * Each provider attempt uses the retry wrapper for transient errors.
 */
export async function llmChat(
  messages: LLMMessage[],
  opts: LLMOptions = {},
): Promise<LLMResponse> {
  const configuredProvider = env.AI_PROVIDER !== 'auto' ? env.AI_PROVIDER as LLMProvider : null;

  // If a specific provider is set in env, use it directly (with retry)
  if (configuredProvider) {
    ensureKeyForProvider(configuredProvider);
    const model = getModelForProvider(configuredProvider);
    return withRetry(() => {
      switch (configuredProvider) {
        case 'anthropic': return callAnthropic(messages, opts, model);
        case 'gemini': return callGemini(messages, opts, model);
        case 'openai': return callOpenAI(messages, opts, model);
      }
    });
  }

  // Auto mode: OpenAI → Gemini → Anthropic waterfall
  const fallbackChain: Array<{ provider: LLMProvider; key: string }> = (
    [
      { provider: 'openai' as LLMProvider, key: env.OPENAI_API_KEY },
      { provider: 'gemini' as LLMProvider, key: env.GEMINI_API_KEY },
      { provider: 'anthropic' as LLMProvider, key: env.ANTHROPIC_API_KEY },
    ] as Array<{ provider: LLMProvider; key: string }>
  ).filter(p => !!p.key);

  if (fallbackChain.length === 0) {
    throw new AppError(503, 'No AI provider configured.', 'AI_UNAVAILABLE');
  }

  let lastErr: unknown;
  for (const { provider, key: _key } of fallbackChain) {
    try {
      const model = getModelForProvider(provider);
      return await withRetry(() => {
        switch (provider) {
          case 'anthropic': return callAnthropic(messages, opts, model);
          case 'gemini': return callGemini(messages, opts, model);
          case 'openai': return callOpenAI(messages, opts, model);
        }
      });
    } catch (err: any) {
      lastErr = err;
      console.warn(`[AI] Provider "${provider}" failed, trying next:`, err?.message ?? err);
    }
  }
  throw lastErr;
}

/**
 * Get info about the currently active AI provider.
 */
export function getActiveProvider(): { provider: LLMProvider; model: string } | null {
  try {
    const provider = resolveProvider();
    return { provider, model: getModelForProvider(provider) };
  } catch {
    return null;
  }
}

/**
 * List all available (configured) providers.
 */
export function getAvailableProviders(): Array<{ provider: LLMProvider; model: string; isActive: boolean }> {
  const active = getActiveProvider();
  const providers: Array<{ provider: LLMProvider; model: string; isActive: boolean }> = [];

  if (env.ANTHROPIC_API_KEY) {
    providers.push({ provider: 'anthropic', model: getModelForProvider('anthropic'), isActive: active?.provider === 'anthropic' });
  }
  if (env.GEMINI_API_KEY) {
    providers.push({ provider: 'gemini', model: getModelForProvider('gemini'), isActive: active?.provider === 'gemini' });
  }
  if (env.OPENAI_API_KEY) {
    providers.push({ provider: 'openai', model: getModelForProvider('openai'), isActive: active?.provider === 'openai' });
  }

  return providers;
}

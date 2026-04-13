import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { env } from './env.js';
import { AppError } from '../lib/errors.js';
// Convert local /uploads/... path to base64 data URI
function resolveImageToBase64(imageUrl) {
    try {
        let filePath = imageUrl;
        if (filePath.startsWith('/uploads/')) {
            filePath = path.join(process.cwd(), filePath);
        }
        if (!fs.existsSync(filePath))
            return null;
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeMap = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
        };
        const mimeType = mimeMap[ext] || 'image/jpeg';
        return { base64: buffer.toString('base64'), mimeType };
    }
    catch {
        return null;
    }
}
// ─── Provider Clients (lazy-initialized) ────────────────────────────────────
let _anthropic = null;
let _gemini = null;
let _openai = null;
function getAnthropicClient() {
    if (!_anthropic)
        _anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    return _anthropic;
}
function getGeminiClient() {
    if (!_gemini)
        _gemini = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    return _gemini;
}
function getOpenAIClient() {
    if (!_openai)
        _openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    return _openai;
}
// ─── Default Models ─────────────────────────────────────────────────────────
const DEFAULT_MODELS = {
    anthropic: 'claude-sonnet-4-20250514',
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4.1', // Best OpenAI model — primary for all chatbot calls
};
// ─── Provider Resolution ────────────────────────────────────────────────────
function resolveProvider() {
    if (env.AI_PROVIDER !== 'auto') {
        return env.AI_PROVIDER;
    }
    // Auto: OpenAI is always the first choice, Gemini as fallback, Anthropic last
    if (env.OPENAI_API_KEY)
        return 'openai';
    if (env.GEMINI_API_KEY)
        return 'gemini';
    if (env.ANTHROPIC_API_KEY)
        return 'anthropic';
    throw new AppError(503, 'No AI provider configured. Set at least one API key: OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY.', 'AI_UNAVAILABLE');
}
// ─── Retry Helper ────────────────────────────────────────────────────────────
async function withRetry(fn, maxRetries = 2, baseDelayMs = 2000) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            // Don't retry on hard errors (auth, content policy, etc.)
            const msg = (err?.message || '').toLowerCase();
            const isRetryable = msg.includes('timeout') ||
                msg.includes('timed out') ||
                msg.includes('network') ||
                msg.includes('econnreset') ||
                msg.includes('econnrefused') ||
                msg.includes('rate limit') ||
                msg.includes('overloaded') ||
                msg.includes('503') ||
                msg.includes('529') ||
                (err?.status >= 500 && err?.status < 600);
            if (!isRetryable || attempt === maxRetries)
                break;
            const delay = baseDelayMs * Math.pow(2, attempt);
            console.warn(`[AI] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, msg);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastErr;
}
function getModelForProvider(provider) {
    if (env.AI_MODEL)
        return env.AI_MODEL;
    return DEFAULT_MODELS[provider];
}
function ensureKeyForProvider(provider) {
    const keys = {
        anthropic: env.ANTHROPIC_API_KEY,
        gemini: env.GEMINI_API_KEY,
        openai: env.OPENAI_API_KEY,
    };
    if (!keys[provider]) {
        throw new AppError(503, `AI provider "${provider}" selected but its API key is not configured.`, 'AI_UNAVAILABLE');
    }
}
// ─── Provider Implementations ───────────────────────────────────────────────
async function callAnthropic(messages, opts, model) {
    const client = getAnthropicClient();
    const apiMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
        if (m.role === 'user' && opts.imageUrl) {
            const imgData = resolveImageToBase64(opts.imageUrl);
            if (imgData) {
                return {
                    role: 'user',
                    content: [
                        { type: 'text', text: m.content },
                        { type: 'image', source: { type: 'base64', media_type: imgData.mimeType, data: imgData.base64 } },
                    ],
                };
            }
            return { role: 'user', content: m.content };
        }
        return { role: m.role, content: m.content };
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
async function callGemini(messages, opts, model) {
    const client = getGeminiClient();
    // Build contents for Gemini
    const systemInstruction = opts.system;
    const contents = [];
    for (const m of messages) {
        if (m.role === 'system')
            continue;
        const parts = [{ text: m.content }];
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
async function callOpenAI(messages, opts, model) {
    const client = getOpenAIClient();
    const apiMessages = [];
    if (opts.system) {
        apiMessages.push({ role: 'system', content: opts.system });
    }
    for (const m of messages) {
        if (m.role === 'system')
            continue;
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
        }
        else {
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
export async function llmChat(messages, opts = {}) {
    const configuredProvider = env.AI_PROVIDER !== 'auto' ? env.AI_PROVIDER : null;
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
    const fallbackChain = [
        { provider: 'openai', key: env.OPENAI_API_KEY },
        { provider: 'gemini', key: env.GEMINI_API_KEY },
        { provider: 'anthropic', key: env.ANTHROPIC_API_KEY },
    ].filter(p => !!p.key);
    if (fallbackChain.length === 0) {
        throw new AppError(503, 'No AI provider configured.', 'AI_UNAVAILABLE');
    }
    let lastErr;
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
        }
        catch (err) {
            lastErr = err;
            console.warn(`[AI] Provider "${provider}" failed, trying next:`, err?.message ?? err);
        }
    }
    throw lastErr;
}
/**
 * Get info about the currently active AI provider.
 */
export function getActiveProvider() {
    try {
        const provider = resolveProvider();
        return { provider, model: getModelForProvider(provider) };
    }
    catch {
        return null;
    }
}
/**
 * List all available (configured) providers.
 */
export function getAvailableProviders() {
    const active = getActiveProvider();
    const providers = [];
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

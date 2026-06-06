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
    const key = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
    if (!_anthropic || _anthropic.apiKey !== key)
        _anthropic = new Anthropic({ apiKey: key });
    return _anthropic;
}
function getGeminiClient() {
    const key = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
    if (!_gemini)
        _gemini = new GoogleGenAI({ apiKey: key });
    return _gemini;
}
function getOpenAIClient() {
    const key = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;
    if (!_openai || _openai.apiKey !== key)
        _openai = new OpenAI({ apiKey: key });
    return _openai;
}
// ─── Default Models ─────────────────────────────────────────────────────────
const DEFAULT_MODELS = {
    anthropic: 'claude-sonnet-4-6', // Primary — latest Claude Sonnet 4.6 (sonnet-4-20250514 is deprecated)
    openai: 'gpt-4.1-mini', // Secondary
    gemini: 'gemini-2.5-flash', // Fallback
};
// ─── Provider Resolution ────────────────────────────────────────────────────
function resolveProvider() {
    // Always read from process.env directly so admin panel switches take effect immediately
    const liveProvider = process.env.AI_PROVIDER || env.AI_PROVIDER;
    if (liveProvider !== 'auto') {
        return liveProvider;
    }
    // Auto: Claude primary → OpenAI secondary → Gemini fallback
    if (process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY)
        return 'anthropic';
    if (process.env.OPENAI_API_KEY || env.OPENAI_API_KEY)
        return 'openai';
    if (process.env.GEMINI_API_KEY || env.GEMINI_API_KEY)
        return 'gemini';
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
    const model = process.env.AI_MODEL || env.AI_MODEL;
    if (model) {
        // Only use AI_MODEL override if it actually belongs to this provider's family.
        // Prevents claude-sonnet-4-6 being sent to OpenAI/Gemini when they are fallbacks.
        const isAnthropicModel = model.startsWith('claude');
        const isOpenAIModel = model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4');
        const isGeminiModel = model.startsWith('gemini');
        const modelMatchesProvider = (provider === 'anthropic' && isAnthropicModel) ||
            (provider === 'openai' && isOpenAIModel) ||
            (provider === 'gemini' && isGeminiModel);
        if (modelMatchesProvider)
            return model;
    }
    return DEFAULT_MODELS[provider];
}
function ensureKeyForProvider(provider) {
    const keys = {
        anthropic: process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY,
        gemini: process.env.GEMINI_API_KEY || env.GEMINI_API_KEY,
        openai: process.env.OPENAI_API_KEY || env.OPENAI_API_KEY,
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
    // Build system param — use cache_control array format when cacheSystem is requested.
    // Anthropic caches the prefix up to the last cache_control breakpoint (min 1024 tokens to be eligible).
    const systemParam = opts.system
        ? opts.cacheSystem
            ? [{ type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } }]
            : opts.system
        : undefined;
    const response = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        system: systemParam,
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
            // Anthropic returns cache read/write tokens — log for visibility
            cacheReadTokens: response.usage?.cache_read_input_tokens,
            cacheWriteTokens: response.usage?.cache_creation_input_tokens,
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
        max_completion_tokens: opts.maxTokens ?? 4096,
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
// Errors that should cascade to the next provider rather than hard-failing.
// Billing/credit errors mean THIS provider can't serve the request — try the next one.
function isProviderCascadeError(err) {
    const msg = (err?.message || '').toLowerCase();
    const status = err?.status ?? err?.statusCode ?? 0;
    return (msg.includes('credit') ||
        msg.includes('billing') ||
        msg.includes('balance') ||
        msg.includes('quota') ||
        msg.includes('insufficient') ||
        msg.includes('payment') ||
        msg.includes('does not exist') || // model not found on this tier
        msg.includes('model_not_found') ||
        msg.includes('not found') && msg.includes('model') ||
        status === 402 || // Payment Required
        status === 429 // Rate limit — try another provider
    );
}
function callProvider(provider, messages, opts) {
    const model = getModelForProvider(provider);
    switch (provider) {
        case 'anthropic': return callAnthropic(messages, opts, model);
        case 'gemini': return callGemini(messages, opts, model);
        case 'openai': return callOpenAI(messages, opts, model);
    }
}
export async function llmChat(messages, opts = {}) {
    // Always read from process.env (live value) — env.AI_PROVIDER is frozen at startup
    const liveProvider = process.env.AI_PROVIDER || env.AI_PROVIDER;
    // Full provider chain — primary first, then the rest as fallbacks.
    // Order: anthropic → openai → gemini (best to cheapest)
    const ALL_PROVIDERS = [
        { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY },
        { provider: 'openai', key: process.env.OPENAI_API_KEY || env.OPENAI_API_KEY },
        { provider: 'gemini', key: process.env.GEMINI_API_KEY || env.GEMINI_API_KEY },
    ].filter(p => !!p.key);
    if (ALL_PROVIDERS.length === 0) {
        throw new AppError(503, 'No AI provider configured. Set at least one API key.', 'AI_UNAVAILABLE');
    }
    // Build the execution chain:
    // - In 'auto' mode: try all providers in order
    // - Otherwise: try the configured provider first, then fall through to others on billing errors
    let chain;
    if (liveProvider === 'auto') {
        chain = ALL_PROVIDERS;
    }
    else {
        const primary = ALL_PROVIDERS.find(p => p.provider === liveProvider);
        const rest = ALL_PROVIDERS.filter(p => p.provider !== liveProvider);
        chain = primary ? [primary, ...rest] : ALL_PROVIDERS;
    }
    let lastErr;
    for (const { provider } of chain) {
        try {
            return await withRetry(() => callProvider(provider, messages, opts));
        }
        catch (err) {
            lastErr = err;
            if (isProviderCascadeError(err)) {
                // Billing/credits/model-not-found — cascade to next provider silently
                console.warn(`[AI] Provider "${provider}" unavailable (${err?.status ?? 'billing/model'}), trying next…`);
                continue;
            }
            // Hard error (auth, content policy, bad request) — don't cascade, surface immediately
            throw err;
        }
    }
    // All providers exhausted
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

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
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
    };
}
/**
 * Send a message to the configured LLM provider.
 * OpenAI is tried first (with retry), then Gemini as fallback, then Anthropic.
 * Each provider attempt uses the retry wrapper for transient errors.
 */
export declare function llmChat(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse>;
/**
 * Get info about the currently active AI provider.
 */
export declare function getActiveProvider(): {
    provider: LLMProvider;
    model: string;
} | null;
/**
 * List all available (configured) providers.
 */
export declare function getAvailableProviders(): Array<{
    provider: LLMProvider;
    model: string;
    isActive: boolean;
}>;

import {api} from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DataWrap<T> { data: T }

export interface AIChatResponse {
  reply: string;
  conversationId: string;
  strategy?: {
    name: string;
    description: string;
    pairs: string[];
    riskLevel: string;
    indicators: string[];
    backtestReturn?: number;
  };
}

export interface VoiceResponse {
  transcript: string;
  intent: string;
  action: string | null;
  reply: string;
}

export interface StrategyResponse {
  name: string;
  description: string;
  pairs: string[];
  riskLevel: string;
  indicators: string[];
  entryRules: string[];
  exitRules: string[];
  backtestReturn: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export const aiApi = {
  /** Chat with AI trading assistant. */
  async chat(message: string, conversationId?: string, attachmentUrl?: string): Promise<AIChatResponse> {
    const res = await api.post<DataWrap<any>>('/ai/chat', {
      message, conversationId, attachmentUrl,
    } as Record<string, unknown>);
    const d = res?.data;
    if (!d) return {reply: 'Sorry, I could not process your request.', conversationId: ''};
    // Backend returns "strategyPreview", frontend uses "strategy"
    return {
      reply: d.reply,
      conversationId: d.conversationId,
      strategy: d.strategyPreview ?? d.strategy,
    };
  },

  /** Load latest chat conversation history. */
  async getChatHistory(): Promise<{conversationId: string | null; messages: Array<{id: string; role: string; content: string; createdAt: string}>}> {
    const res = await api.get<DataWrap<any>>('/ai/chat/history');
    return res?.data ?? {conversationId: null, messages: []};
  },

  /** Send voice command transcript. */
  async voiceCommand(transcript: string): Promise<VoiceResponse> {
    const res = await api.post<DataWrap<VoiceResponse>>('/ai/voice', {transcript} as Record<string, unknown>);
    return res?.data ?? {transcript, intent: 'unknown', action: null, reply: 'Could not process voice command.'};
  },

  /** Generate a trading strategy from description. */
  async generateStrategy(description: string, pairs?: string[], riskLevel?: string): Promise<StrategyResponse> {
    const res = await api.post<DataWrap<StrategyResponse>>('/ai/strategy/generate', {
      description, pairs, riskLevel,
    } as Record<string, unknown>);
    return res?.data ?? {name: '', description: '', pairs: [], riskLevel: 'Med', indicators: [], entryRules: [], exitRules: [], backtestReturn: 0};
  },
};

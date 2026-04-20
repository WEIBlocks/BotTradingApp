import {api} from './api';
import {API_BASE_URL} from '../config/api';
import {storage} from './storage';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DataWrap<T> { data: T }

export interface AIChatResponse {
  reply: string;
  conversationId: string;
  cleanPrompt?: string;
  strategy?: {
    name: string;
    description?: string;
    strategy?: string;
    assetClass?: 'crypto' | 'stocks';
    pairs: string[];
    riskLevel: string;
    indicators?: string[];
    stopLoss?: number;
    takeProfit?: number;
    tradingFrequency?: string;
    aiMode?: string;
    maxOpenPositions?: number;
    tradingSchedule?: string;
    backtestReturn?: number; // normalized from backtestEstimate.return30d
    backtestWinRate?: number;
    backtestDrawdown?: number;
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
  /**
   * Streaming chat via XMLHttpRequest (required for React Native — fetch has no ReadableStream).
   * Uses SSE: each event is "data: {...}\n\n"
   * onToken: called with each streamed text delta
   * onTool:  called when a tool round fires (e.g. "get_crypto_price")
   * onDone:  called with final metadata once stream ends
   */
  chatStream(
    message: string,
    conversationId: string | undefined,
    onToken: (token: string) => void,
    onTool: (toolName: string) => void,
    onDone: (meta: { conversationId: string; model: string; toolsUsed?: string[]; cleanPrompt?: string; strategyPreview?: AIChatResponse['strategy'] }) => void,
    attachmentUrl?: string,
    botId?: string,
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const authToken = await storage.getAccessToken();

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/ai/chat/stream`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);

      let processedLen = 0; // how many chars of responseText we've already parsed
      let buf = '';

      function parseChunk(raw: string) {
        buf += raw;
        // SSE events are separated by "\n\n"
        const events = buf.split('\n\n');
        buf = events.pop() ?? ''; // keep the incomplete trailing chunk
        for (const event of events) {
          const line = event.trim();
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.token !== undefined) {
              onToken(parsed.token);
            } else if (parsed.tool) {
              onTool(parsed.tool);
            } else if (parsed.done) {
              const raw = parsed.strategyPreview;
              const strategy = raw ? {
                ...raw,
                backtestReturn: raw.backtestReturn ?? raw.backtestEstimate?.return30d,
                backtestWinRate: raw.backtestWinRate ?? raw.backtestEstimate?.winRate,
                backtestDrawdown: raw.backtestDrawdown ?? raw.backtestEstimate?.maxDrawdown,
              } : undefined;
              onDone({ conversationId: parsed.conversationId, model: parsed.model, toolsUsed: parsed.toolsUsed, cleanPrompt: parsed.cleanPrompt, strategyPreview: strategy });
            } else if (parsed.error) {
              reject(new Error(parsed.error));
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }

      // onprogress fires as each chunk arrives — this is the key for RN streaming
      xhr.onprogress = () => {
        const newText = xhr.responseText.slice(processedLen);
        processedLen = xhr.responseText.length;
        if (newText) parseChunk(newText);
      };

      xhr.onload = () => {
        // Parse any remaining buffered data after stream ends
        const newText = xhr.responseText.slice(processedLen);
        if (newText) parseChunk(newText);
        if (xhr.status >= 400) {
          try {
            const err = JSON.parse(xhr.responseText);
            reject(new Error(err.message || `HTTP ${xhr.status}`));
          } catch {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        } else {
          resolve();
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.ontimeout = () => reject(new Error('Request timed out'));
      xhr.timeout = 120000; // 2 min max

      xhr.send(JSON.stringify({ message, conversationId, attachmentUrl, botId }));
    });
  },

  /** Chat with AI trading assistant (non-streaming fallback). */
  async chat(message: string, conversationId?: string, attachmentUrl?: string, botId?: string): Promise<AIChatResponse> {
    const res = await api.post<DataWrap<any>>('/ai/chat', {
      message, conversationId, attachmentUrl, botId,
    } as Record<string, unknown>);
    const d = res?.data;
    if (!d) return {reply: 'Sorry, I could not process your request.', conversationId: ''};
    // Backend returns "strategyPreview", normalize backtestEstimate → backtestReturn
    const raw = d.strategyPreview ?? d.strategy;
    const strategy = raw ? {
      ...raw,
      backtestReturn: raw.backtestReturn ?? raw.backtestEstimate?.return30d,
      backtestWinRate: raw.backtestWinRate ?? raw.backtestEstimate?.winRate,
      backtestDrawdown: raw.backtestDrawdown ?? raw.backtestEstimate?.maxDrawdown,
    } : undefined;
    return {
      reply: d.reply,
      conversationId: d.conversationId,
      cleanPrompt: d.cleanPrompt,
      strategy,
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

  // ─── Conversations ─────────────────────────────────────────────────────────

  async listConversations() {
    const res = await api.get('/ai/conversations');
    return (res as any)?.data ?? [];
  },

  async getConversation(conversationId: string) {
    const res = await api.get(`/ai/conversations/${conversationId}`);
    return (res as any)?.data ?? {conversationId, messages: []};
  },

  async deleteConversation(conversationId: string) {
    await api.delete(`/ai/conversations/${conversationId}`);
  },

  async renameConversation(conversationId: string, title: string) {
    const res = await api.patch(`/ai/conversations/${conversationId}`, {title} as Record<string, unknown>);
    return (res as any)?.data ?? {conversationId, title};
  },

  // ─── Market Scanner ─────────────────────────────────────────────────────────

  async getTopAssets(limit = 10) {
    const res = await api.get(`/ai/market/top?limit=${limit}`);
    return (res as any).data?.data ?? (res as any).data;
  },

  async getMarketOverview() {
    const res = await api.get('/ai/market/overview');
    return (res as any).data?.data ?? (res as any).data;
  },

  // ─── YouTube ────────────────────────────────────────────────────────────────

  async analyzeYouTube(url: string) {
    const res = await api.post('/ai/youtube/analyze', {url} as Record<string, unknown>);
    return (res as any).data?.data ?? (res as any).data;
  },

  async learnFromYouTube(url: string, botId?: string) {
    // YouTube processing (fetch + transcript + Claude classification) can take 20-30s
    const res = await api.post('/ai/youtube/learn', {url, botId} as Record<string, unknown>, {timeout: 60000});
    return (res as any).data?.data ?? (res as any).data;
  },

  // ─── Knowledge Stats ───────────────────────────────────────────────────────

  async getKnowledgeStats() {
    const res = await api.get('/ai/knowledge/stats');
    return (res as any).data?.data ?? (res as any).data;
  },

  // ─── Chat with Image ──────────────────────────────────────────────────────

  async chatWithImage(
    message: string,
    imageUri: string,
    conversationId?: string,
    onProgress?: (pct: number) => void,
  ): Promise<AIChatResponse> {
    const token = await storage.getAccessToken();

    const formData = new FormData();
    formData.append('message', message);
    if (conversationId) formData.append('conversationId', conversationId);

    const filename = imageUri.split('/').pop() || 'chart.jpg';
    const ext = /\.(\w+)$/.exec(filename);
    const mimeType = ext ? `image/${ext[1] === 'jpg' ? 'jpeg' : ext[1]}` : 'image/jpeg';
    formData.append('image', {
      uri: imageUri,
      name: filename,
      type: mimeType,
    } as any);

    // Signal upload started
    onProgress?.(10);

    // Use raw fetch — not the api wrapper which JSON.stringify's the body
    const res = await fetch(`${API_BASE_URL}/ai/chat/image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        // Do NOT set Content-Type — fetch will auto-set multipart boundary
      },
      body: formData,
    });

    onProgress?.(70);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error((errData as any).message || 'Failed to upload image');
    }

    const json = await res.json();
    onProgress?.(100);

    const d = (json as any)?.data ?? json;
    const rawS = d.strategyPreview ?? d.strategy;
    const strategy = rawS ? {
      ...rawS,
      backtestReturn: rawS.backtestReturn ?? rawS.backtestEstimate?.return30d,
      backtestWinRate: rawS.backtestWinRate ?? rawS.backtestEstimate?.winRate,
      backtestDrawdown: rawS.backtestDrawdown ?? rawS.backtestEstimate?.maxDrawdown,
    } : undefined;
    return {
      reply: d.reply || 'No response',
      conversationId: d.conversationId || '',
      cleanPrompt: d.cleanPrompt,
      strategy,
    };
  },
};

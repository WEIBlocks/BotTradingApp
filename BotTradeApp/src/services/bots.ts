import {api} from './api';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BotStatus = 'live' | 'paper';

export type ActiveBot = {
  id: string;
  name: string;
  pair: string;
  avatarColor: string;
  status: BotStatus;
  totalReturn: number;
};

export type BotSubscription = {
  id: string;
  botId: string;
  mode: BotStatus;
  allocatedAmount?: number;
  bot: ActiveBot;
  createdAt: string;
  updatedAt: string;
};

export type ActiveBotsResponse = {
  subscriptions: BotSubscription[];
};

export type PurchaseBody = {
  mode: 'live' | 'paper';
  allocatedAmount?: number;
};

// ─── API ─────────────────────────────────────────────────────────────────────

export const botsService = {
  /** Get user's active bot subscriptions */
  getActive() {
    return api.get<ActiveBotsResponse>('/bots/user/active');
  },

  /** Pause a bot subscription */
  pause(botId: string) {
    return api.post(`/bots/${botId}/pause`, {});
  },

  /** Stop a bot subscription */
  stop(botId: string) {
    return api.post(`/bots/${botId}/stop`, {});
  },

  /** Resume a paused bot subscription */
  resume(botId: string) {
    return api.post(`/bots/${botId}/resume`, {});
  },

  /** Subscribe to a bot */
  purchase(botId: string, body: PurchaseBody) {
    return api.post(`/bots/${botId}/purchase`, body as Record<string, unknown>);
  },

  /** Start shadow mode for a bot */
  startShadowMode(botId: string, config?: {virtualBalance?: number; durationDays?: number; durationMinutes?: number}) {
    return api.post(`/bots/${botId}/shadow-mode`, (config ?? {}) as Record<string, unknown>);
  },

  /** Get all shadow mode sessions */
  getShadowSessions() {
    return api.get<{data: any[]}>('/bots/shadow-sessions');
  },

  /** Get shadow mode results for a session */
  getShadowResults(sessionId: string) {
    return api.get<{data: any}>(`/bots/shadow-sessions/${sessionId}/results`);
  },

  /** Pause a shadow session */
  pauseShadowSession(sessionId: string) {
    return api.post(`/bots/shadow-sessions/${sessionId}/pause`, {});
  },

  /** Resume a paused shadow session */
  resumeShadowSession(sessionId: string) {
    return api.post(`/bots/shadow-sessions/${sessionId}/resume`, {});
  },

  /** Stop/cancel a shadow session */
  stopShadowSession(sessionId: string) {
    return api.post(`/bots/shadow-sessions/${sessionId}/stop`, {});
  },

  /** Get paper trading status */
  getPaperTradingStatus() {
    return api.get<{data: any}>('/bots/paper-trading/status');
  },

  /** Setup paper trading */
  setupPaperTrading(data: {botId: string; virtualBalance: number; durationDays?: number}) {
    return api.post('/bots/paper-trading/setup', data as Record<string, unknown>);
  },

  /** Run a backtest */
  backtest(botId: string, config: {startDate: string; endDate: string; initialBalance: number}) {
    return api.post<{data: any}>(`/bots/${botId}/backtest`, config as Record<string, unknown>);
  },

  /** Add a review for a bot */
  addReview(botId: string, data: {rating: number; text: string}) {
    return api.post(`/bots/${botId}/reviews`, data as Record<string, unknown>);
  },

  /** Create a new bot */
  createBot(data: {
    name: string;
    description?: string;
    strategy?: string;
    category?: string;
    riskLevel?: string;
    pairs?: string[];
    priceMonthly?: number;
    stopLoss?: number;
    takeProfit?: number;
    maxPosition?: number;
  }) {
    return api.post<{data: any}>('/bots/create', data as Record<string, unknown>);
  },

  /** Update an existing bot */
  updateBot(botId: string, data: {
    name?: string;
    strategy?: string;
    category?: string;
    risk_level?: string;
    pairs?: string[];
    stopLoss?: number;
    takeProfit?: number;
    maxPositionSize?: number;
  }) {
    return api.put<{data: any}>(`/bots/${botId}`, data as Record<string, unknown>);
  },

  /** Get bot data for editing (creator only) */
  getBotForEdit(botId: string) {
    return api.get<{data: any}>(`/bots/${botId}/edit`);
  },
};

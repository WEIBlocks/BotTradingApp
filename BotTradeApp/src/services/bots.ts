import {api, uploadFormData} from './api';

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
  minOrderValue?: number;
  exchangeConnId?: string;
};

// All fields a creator can edit on their bot. Used by both `createBot` and
// `updateBot` so the two endpoints stay in sync — if a field is editable
// later, it must be editable now.
export type BotCondition = {
  indicator: string;
  operator: '<' | '>' | '<=' | '>=' | 'crosses_above' | 'crosses_below';
  value: number;
  weight: number;
};

export type BotEditableFields = {
  // Identity / marketplace
  name?: string;
  subtitle?: string;
  description?: string;
  tags?: string[];
  priceMonthly?: number;
  creatorFeePercent?: number;
  // Strategy
  strategy?: string;
  category?: string;
  risk_level?: string;
  pairs?: string[];
  prompt?: string;
  // Risk / sizing
  stopLoss?: number;
  takeProfit?: number;
  maxPositionSize?: number;
  dailyLossLimit?: number;
  maxOpenPositions?: number;
  // Execution
  tradeDirection?: 'buy' | 'sell' | 'both';
  orderType?: 'market' | 'limit';
  tradingFrequency?: 'conservative' | 'balanced' | 'aggressive' | 'max';
  tradingSchedule?: '24_7' | 'us_hours' | 'custom';
  // AI
  aiMode?: 'rules_only' | 'hybrid' | 'full_ai';
  maxHoldsBeforeAI?: number;
  aiConfidenceThreshold?: number;
  customEntryConditions?: BotCondition[];
  customExitConditions?: BotCondition[];
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
  startShadowMode(botId: string, config?: {virtualBalance?: number; durationDays?: number; durationMinutes?: number; minOrderValue?: number}) {
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

  /** Create a new bot. Mirrors `BotEditableFields` 1:1 plus the required name/strategy
   *  for the initial insert. */
  createBot(data: BotEditableFields & {name: string; strategy?: string}) {
    return api.post<{data: any}>('/bots/create', data as Record<string, unknown>);
  },

  /** Update any subset of an existing bot's fields. Backend updateBot persists
   *  every field listed in `BotEditableFields`. */
  updateBot(botId: string, data: BotEditableFields) {
    return api.put<{data: any}>(`/bots/${botId}`, data as Record<string, unknown>);
  },

  /** Get bot data for editing (creator only) */
  getBotForEdit(botId: string) {
    return api.get<{data: any}>(`/bots/${botId}/edit`);
  },

  /**
   * Delete a bot (creator only).
   * Backend rejects with 409 if anyone is running it (live, paper, shadow,
   * copy-trading, or has open positions). On success the bot and all its
   * dependent data are removed from the database.
   */
  deleteBot(botId: string) {
    return api.delete<{data: {deleted: true; botId: string; name: string}}>(`/bots/${botId}`);
  },

  /**
   * Upload (or replace) the bot's avatar image. Multipart form upload.
   * `image.uri` is a content:// or file:// URI from react-native-image-picker.
   * Returns the updated bot with `avatarUrl` set.
   */
  uploadAvatar(botId: string, image: {uri: string; name: string; type: string}) {
    const formData = new FormData();
    formData.append('file', {
      uri: image.uri,
      name: image.name,
      type: image.type,
    } as any);
    return uploadFormData<{data: {id: string; avatarUrl: string | null}}>(
      `/bots/${botId}/avatar`,
      formData,
    );
  },

  /** Remove the bot's avatar image and revert to letter+color fallback. */
  removeAvatar(botId: string) {
    return api.delete<{data: {id: string; avatarUrl: string | null}}>(`/bots/${botId}/avatar`);
  },

  /** Get a subscription by ID (includes userConfig overrides) */
  getSubscription(subscriptionId: string) {
    return api.get<{data: any}>(`/bots/subscriptions/${subscriptionId}`);
  },

  /** Update subscriber-level customization for a subscription */
  updateUserConfig(subscriptionId: string, config: {
    riskMultiplier?: 0.5 | 1 | 1.5 | 2;
    maxDailyLoss?: number;
    autoStopBalance?: number;
    autoStopDays?: number;
    autoStopLossPercent?: number;
    compoundProfits?: boolean;
    notificationLevel?: 'all' | 'wins_only' | 'losses_only' | 'summary';
  }) {
    return api.patch<{data: any}>(`/bots/subscriptions/${subscriptionId}/user-config`, config as Record<string, unknown>);
  },

  /** Activate live trading mode with exchange connection */
  activateLiveMode(botId: string, exchangeConnId: string, allocatedAmount?: number) {
    return api.post<{data: any}>(`/bots/${botId}/activate-live`, {exchangeConnId, allocatedAmount} as Record<string, unknown>);
  },

  /** Get bot decision history (live feed data) with pagination */
  getDecisions(botId: string, limit = 50, offset = 0, mode?: 'paper' | 'live') {
    const modeParam = mode ? `&mode=${mode}` : '';
    return api.get<{data: {decisions: any[]; pagination: {total: number; hasMore: boolean}}}>(`/bots/${botId}/decisions?limit=${limit}&offset=${offset}${modeParam}`);
  },

  /** Get comprehensive feed stats (P&L, positions, trades) */
  getFeedStats(botId: string, mode?: 'paper' | 'live') {
    const modeParam = mode ? `?mode=${mode}` : '';
    return api.get<{data: any}>(`/bots/${botId}/feed-stats${modeParam}`);
  },

  /** Aggregated public live stats (all live users) for a bot */
  getPublicLiveStats(botId: string) {
    return api.get<{data: any}>(`/bots/${botId}/public-live-stats`);
  },

  /** Current user's personal live trading stats for a bot */
  getMyLiveStats(botId: string) {
    return api.get<{data: any}>(`/bots/${botId}/my-live-stats`);
  },

  /** Current user's shadow session detailed stats (by sessionId) */
  getShadowSessionLiveStats(sessionId: string) {
    return api.get<{data: any}>(`/bots/shadow-sessions/${sessionId}/live-stats`);
  },

  // ─── Compounding ──────────────────────────────────────────────────────────

  /** Get compounding settings for a subscription */
  getCompounding(subscriptionId: string) {
    return api.get<{data: {compounding: CompoundingSettings; allocatedAmount: number}}>(`/bots/subscriptions/${subscriptionId}/compounding`);
  },

  /** Update compounding settings for a subscription */
  updateCompounding(subscriptionId: string, settings: Partial<CompoundingSettings>) {
    return api.patch<{data: {compounding: CompoundingSettings}}>(`/bots/subscriptions/${subscriptionId}/compounding`, settings as Record<string, unknown>);
  },

  // ─── Trainer ─────────────────────────────────────────────────────────────

  /** Get trainer status, performance snapshot, and config for a bot */
  getTrainerStatus(botId: string) {
    return api.get<{data: TrainerStatusResponse}>(`/bots/${botId}/trainer`);
  },

  /** Update trainer configuration (creator only) */
  updateTrainerConfig(botId: string, config: Partial<TrainerConfig>) {
    return api.patch<{data: {config: TrainerConfig}}>(`/bots/${botId}/trainer/config`, config as Record<string, unknown>);
  },

  /** Trigger a manual retrain (creator only) — runs trainer agent, stores pending improvements */
  triggerRetrain(botId: string) {
    return api.post<{data: {success: boolean; message: string; trainerResult?: any}}>(`/bots/${botId}/trainer/retrain`, {});
  },

  /** Promote pending trainer improvements to live bot */
  promoteTrainerChanges(botId: string) {
    return api.post<{data: {success: boolean; message: string}}>(`/bots/${botId}/trainer/promote`, {});
  },
};

// ─── Trainer / Compounding Types for Mobile ───────────────────────────────────

export interface CompoundingSettings {
  enabled: boolean;
  reinvestmentRate: number;
  reinvestmentMode: 'free_balance' | 'total_balance' | 'fixed';
  compoundFrequency: 'each_trade' | 'daily' | 'weekly' | 'manual';
  maxPositionSizeUSD: number | null;
  minProfitThresholdUSD: number;
  maxCompoundMultiplier: number;
  withdrawalReservePct: number;
  riskReductionEnabled: boolean;
  riskReductionRate: number;
  totalCompounded: number;
  lastCompoundAt: string | null;
}

export interface TrainerInsight {
  ts: string;
  type: 'info' | 'warning' | 'improvement' | 'retrain';
  message: string;
  action?: string;
}

export interface TrainerConfig {
  trainingMode: 'auto' | 'suggestions' | 'off';
  autoRetrain: boolean;
  retrainMode: 'time' | 'performance' | 'combined';
  retrainIntervalDays: number;
  profitFactorFloor: number;
  winRateDropThreshold: number;
  consecutiveLossLimit: number;
  shadowValidationHours: number;
  lastRetrainAt: string | null;
  trainerScore: number | null;
  trainerStatus: 'idle' | 'monitoring' | 'retraining' | 'shadow_validating';
  pendingPrompt: string | null;
  pendingConfig: Record<string, any> | null;
  lastInsightAt: string | null;
  insights: TrainerInsight[];
}

export interface BotPerformanceSnapshot {
  botId: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  avgWinPct: number;
  avgLossPct: number;
  maxDrawdown: number;
  consecutiveLosses: number;
  recentWinRate: number;
  sharpeEstimate: number;
  trainerScore: number;
  needsRetrain: boolean;
  retrainReason: string | null;
}

export interface TrainerStatusResponse {
  config: TrainerConfig;
  performance: BotPerformanceSnapshot;
  redisStatus: string | null;
  isCreator: boolean;
}

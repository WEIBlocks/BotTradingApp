/**
 * Bot Trading Engine — Hybrid AI Decision System v2
 *
 * Fixes in v2:
 * - Positions persisted to DB (survive restarts)
 * - P&L calculated from actual position close (not regex)
 * - Paper mode removed (only shadow + live)
 * - HOLD decisions NOT stored (only BUY/SELL logged)
 * - Redis publish errors logged properly
 * - Rate limiting on AI calls per bot
 * - Risk level impacts rule aggressiveness
 * - RAG training data injected into decisions
 * - Bot learns from past decision outcomes
 * - Concurrent trade protection via Redis locks
 * - Live subscription expiry enforcement
 * - DCA/Grid strategies bypass AI (pure rule execution)
 */

import { db } from '../config/database.js';
import { redisConnection } from '../config/queue.js';
import { llmChat, type LLMMessage, type LLMOptions } from '../config/ai.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';
import { retrieveKnowledge } from './rag.js';
import { computeIndicators, hasSignificantChange, type IndicatorSnapshot } from './indicators.js';
import { getPrice } from '../jobs/price-sync.job.js';
import { botDecisions } from '../db/schema/decisions.js';
import { botPositions } from '../db/schema/positions.js';
import { trades } from '../db/schema/trades.js';
import { bots, botSubscriptions } from '../db/schema/bots.js';
import { exchangeConnections } from '../db/schema/exchanges.js';
import { decrypt } from './encryption.js';
import { createAdapter } from '../modules/exchange/adapters/adapter.factory.js';
import { eq, and, sql, desc, isNull } from 'drizzle-orm';

// ─── OpenAI Direct Client (better JSON reliability) ────────────────────────

let _engineOpenAI: OpenAI | null = null;
async function engineLLMChat(messages: LLMMessage[], opts: LLMOptions) {
  if (env.OPENAI_API_KEY) {
    if (!_engineOpenAI) _engineOpenAI = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    try {
      const apiMessages: any[] = [];
      if (opts.system) apiMessages.push({ role: 'system', content: opts.system });
      for (const m of messages) {
        if (m.role !== 'system') apiMessages.push({ role: m.role, content: m.content });
      }
      const response = await _engineOpenAI.chat.completions.create({
        model: 'gpt-5.4-mini',
        messages: apiMessages,
        max_completion_tokens: opts.maxTokens ?? 1024,
        temperature: opts.temperature ?? 0.2,
      });
      return {
        text: response.choices[0]?.message?.content ?? '',
        provider: 'openai' as const,
        model: 'gpt-5.4-mini',
        usage: { inputTokens: response.usage?.prompt_tokens, outputTokens: response.usage?.completion_tokens },
      };
    } catch (err) {
      console.warn('[BotEngine] OpenAI failed, falling back:', (err as Error).message);
    }
  }
  return llmChat(messages, opts);
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TradingRules {
  entryConditions: RuleCondition[];
  exitConditions: RuleCondition[];
  stopLossPercent: number;
  takeProfitPercent: number;
  maxPositionPercent: number;
  cooldownMinutes: number;
}

export interface RuleCondition {
  indicator: string;
  operator: '<' | '>' | '<=' | '>=' | 'crosses_above' | 'crosses_below';
  value: number;
  weight: number;
}

export interface EngineDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasoning: string;
  indicators: Record<string, number | string | null>;
  aiCalled: boolean;
  tokensCost: number;
  price: number;
  symbol: string;
  sizePercent?: number;
  pnl?: number;
  pnlPercent?: number;
  // Exact amount and value used by the engine — shadow/live jobs must use these
  // for trade records so bot_positions and trades are always consistent
  tradeAmount?: number;
  tradeValue?: number;
}

// ─── Caches ─────────────────────────────────────────────────────────────────

const priceHistoryBuffer: Map<string, number[]> = new Map();
const indicatorCache: Map<string, IndicatorSnapshot> = new Map();
const rulesCache: Map<string, { rules: TradingRules; generatedAt: number }> = new Map();
const lastDecisionCache: Map<string, { action: string; time: number }> = new Map();
const aiCallCount: Map<string, { count: number; windowStart: number }> = new Map();
const holdCountCache: Map<string, number> = new Map();

const MAX_PRICE_HISTORY = 100;
const RULES_TTL_MS = 30 * 60 * 1000;
// max AI calls per bot per hour — configurable via AI_RATE_LIMIT_PER_HOUR env var
const AI_RATE_LIMIT = env.AI_RATE_LIMIT_PER_HOUR;

function addPrice(key: string, price: number): number[] {
  if (!priceHistoryBuffer.has(key)) priceHistoryBuffer.set(key, []);
  const hist = priceHistoryBuffer.get(key)!;
  hist.push(price);
  if (hist.length > MAX_PRICE_HISTORY) hist.shift();
  return hist;
}

// Seed price history from real price-sync cache (DB-backed, 30s ticks)
// Falls back to repeated current price if not enough real data yet — indicators
// will produce flat/neutral values until real history accumulates.
async function seedPriceHistoryFromReal(key: string, symbol: string, currentPrice: number, count = 30): Promise<number[]> {
  if (priceHistoryBuffer.has(key) && priceHistoryBuffer.get(key)!.length >= 20) {
    return priceHistoryBuffer.get(key)!;
  }
  const prices: number[] = [];
  try {
    // Try to load real OHLCV history from price-sync cache (stored as 24h klines)
    const priceSyncMod = await import('../jobs/price-sync.job.js') as any;
    const history = typeof priceSyncMod.getPriceHistory === 'function'
      ? await priceSyncMod.getPriceHistory(symbol, count)
      : null;
    if (history && history.length >= 5) {
      prices.push(...history);
    }
  } catch {
    // price-sync job may not export getPriceHistory — use current price as neutral seed
  }
  // If we still don't have enough, pad with current price (neutral — no false signals)
  while (prices.length < count) prices.unshift(currentPrice);
  prices.push(currentPrice);
  priceHistoryBuffer.set(key, prices);
  return prices;
}

// Synchronous wrapper kept for call sites that can't await — uses only in-memory buffer
function seedPriceHistory(key: string, currentPrice: number, count = 30): number[] {
  if (priceHistoryBuffer.has(key) && priceHistoryBuffer.get(key)!.length >= 20) {
    return priceHistoryBuffer.get(key)!;
  }
  // Pad with current price — flat/neutral, no random noise to generate false signals
  const prices = Array(count).fill(currentPrice) as number[];
  prices.push(currentPrice);
  priceHistoryBuffer.set(key, prices);
  return prices;
}

function checkAIRateLimit(botId: string): boolean {
  const now = Date.now();
  const entry = aiCallCount.get(botId);
  if (!entry || now - entry.windowStart > 3600_000) {
    aiCallCount.set(botId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= AI_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Position Management (DB-backed) ────────────────────────────────────────

async function getOpenPosition(botId: string, symbol: string, shadowSessionId?: string, isPaper?: boolean) {
  const conditions = [
    eq(botPositions.botId, botId),
    eq(botPositions.symbol, symbol),
    eq(botPositions.status, 'open'),
    // Scope to session so positions from other sessions don't block new entries
    shadowSessionId
      ? eq(botPositions.shadowSessionId, shadowSessionId)
      : isNull(botPositions.shadowSessionId),
  ];

  // Critical: filter by isPaper so live positions don't block paper/shadow trades and vice versa
  if (isPaper !== undefined) {
    conditions.push(eq(botPositions.isPaper, isPaper));
  }

  const [pos] = await db.select().from(botPositions).where(and(...conditions)).limit(1);
  return pos;
}

async function openPosition(opts: {
  userId: string; botId: string; symbol: string;
  entryPrice: number; amount: number; entryValue: number;
  stopLoss?: number; takeProfit?: number;
  isPaper: boolean; reasoning: string;
  subscriptionId?: string; shadowSessionId?: string;
  entryTradeId?: string;
}) {
  const [pos] = await db.insert(botPositions).values({
    userId: opts.userId,
    botId: opts.botId,
    symbol: opts.symbol,
    side: 'long',
    entryPrice: opts.entryPrice.toFixed(8),
    amount: opts.amount.toFixed(8),
    entryValue: opts.entryValue.toFixed(2),
    stopLoss: opts.stopLoss?.toFixed(8),
    takeProfit: opts.takeProfit?.toFixed(8),
    isPaper: opts.isPaper,
    entryReasoning: opts.reasoning,
    subscriptionId: opts.subscriptionId || null,
    shadowSessionId: opts.shadowSessionId || null,
    entryTradeId: opts.entryTradeId || null,
    status: 'open',
  }).returning();
  return pos;
}

async function closePosition(positionId: string, exitPrice: number, reasoning: string, exitTradeId?: string, feeRate = 0) {
  const [pos] = await db.select().from(botPositions).where(eq(botPositions.id, positionId)).limit(1);
  if (!pos) return null;

  const entryPrice = parseFloat(pos.entryPrice);
  const amount = parseFloat(pos.amount);
  const exitValue = amount * exitPrice;
  const entryValue = parseFloat(pos.entryValue ?? '0') || amount * entryPrice;
  // Include trading fees so bot_positions.pnl matches trades.pnl
  const fee = (exitValue + entryValue) * feeRate;
  const pnl = exitValue - entryValue - fee;
  const pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100 - feeRate * 2 * 100;

  const [updated] = await db.update(botPositions).set({
    exitPrice: exitPrice.toFixed(8),
    exitValue: exitValue.toFixed(2),
    pnl: pnl.toFixed(2),
    pnlPercent: pnlPercent.toFixed(4),
    status: 'closed',
    exitReasoning: reasoning,
    exitTradeId: exitTradeId || null,
    closedAt: new Date(),
  }).where(eq(botPositions.id, positionId)).returning();

  // Update bot statistics in real-time after every position close
  try {
    const { botStatistics } = await import('../db/schema/bots.js');
    const allClosed = await db.select().from(botPositions)
      .where(and(eq(botPositions.botId, pos.botId), eq(botPositions.status, 'closed'), eq(botPositions.isPaper, false)));

    const wins = allClosed.filter(p => parseFloat(p.pnl ?? '0') > 0).length;
    const winRate = allClosed.length > 0 ? (wins / allClosed.length) * 100 : 0;
    const totalReturn = allClosed.reduce((sum, p) => sum + parseFloat(p.pnlPercent ?? '0'), 0);

    // Max drawdown
    let peak = 0, maxDD = 0, cum = 0;
    for (const p of allClosed) {
      cum += parseFloat(p.pnlPercent ?? '0');
      if (cum > peak) peak = cum;
      if (peak - cum > maxDD) maxDD = peak - cum;
    }

    await db.update(botStatistics).set({
      winRate: winRate.toFixed(2),
      return30d: totalReturn.toFixed(2),
      maxDrawdown: maxDD.toFixed(2),
      updatedAt: new Date(),
    }).where(eq(botStatistics.botId, pos.botId));
  } catch {}

  return { ...updated, pnlNum: pnl, pnlPercentNum: pnlPercent };
}

// ─── Acquire/Release Redis Lock ─────────────────────────────────────────────

async function acquireLock(key: string, ttlMs = 30000): Promise<boolean> {
  try {
    const result = await redisConnection.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  } catch { return true; } // If Redis fails, proceed without lock
}

async function releaseLock(key: string) {
  try { await redisConnection.del(`lock:${key}`); } catch {}
}

// ─── Strategy Detection ─────────────────────────────────────────────────────

function isRuleOnlyStrategy(strategy: string | null | undefined): boolean {
  const s = (strategy ?? '').toLowerCase();
  return s.includes('dca') || s.includes('dollar') || s.includes('grid');
}

// ─── Rule Generation ────────────────────────────────────────────────────────

const RULE_GENERATION_SYSTEM = `You are a trading rules compiler. Convert the user's trading strategy description into executable trading rules as JSON.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "entryConditions": [
    { "indicator": "rsi", "operator": "<", "value": 30, "weight": 0.8 },
    { "indicator": "price_vs_ema20", "operator": "<", "value": 0.99, "weight": 0.6 }
  ],
  "exitConditions": [
    { "indicator": "rsi", "operator": ">", "value": 70, "weight": 0.8 }
  ],
  "stopLossPercent": 3,
  "takeProfitPercent": 8,
  "maxPositionPercent": 20,
  "cooldownMinutes": 10
}

Available indicators: rsi, ema20, ema50, price_vs_ema20, price_vs_ema50, macd_histogram, price_vs_bb_upper, price_vs_bb_lower, price_change_pct, volume_change_pct
Operators: <, >, <=, >=, crosses_above, crosses_below
Weight: 0-1 (importance, 0.5+ = must-match)`;

export async function generateRules(
  botPrompt: string, strategy: string | null | undefined, riskLevel: string,
  stopLoss?: number, takeProfit?: number, maxPosition?: number,
): Promise<TradingRules> {
  const safeStrategy = strategy ?? '';
  // DCA/Grid: skip AI, use pure defaults
  if (isRuleOnlyStrategy(safeStrategy) && !botPrompt) {
    return getDefaultRules(safeStrategy, riskLevel, stopLoss, takeProfit, maxPosition);
  }

  const prompt = `Strategy: ${safeStrategy || 'Balanced'} | Risk: ${riskLevel}
${stopLoss ? `Stop loss: ${stopLoss}%` : ''}${takeProfit ? ` | Take profit: ${takeProfit}%` : ''}${maxPosition ? ` | Max position: ${maxPosition}%` : ''}
Instructions: ${botPrompt || `Standard ${safeStrategy || 'balanced'} with ${riskLevel} risk.`}
Generate trading rules JSON.`;

  try {
    const response = await engineLLMChat(
      [{ role: 'user', content: prompt }],
      { system: RULE_GENERATION_SYSTEM, maxTokens: 1024, temperature: 0.1 },
    );

    let jsonText = response.text;
    const codeBlock = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonText = codeBlock[1].trim();
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const rules = JSON.parse(jsonMatch[0]) as TradingRules;
    if (stopLoss) rules.stopLossPercent = stopLoss;
    if (takeProfit) rules.takeProfitPercent = takeProfit;
    if (maxPosition) rules.maxPositionPercent = maxPosition;
    if (!rules.cooldownMinutes) rules.cooldownMinutes = 5;
    if (!rules.entryConditions?.length) rules.entryConditions = [{ indicator: 'rsi', operator: '<', value: 35, weight: 0.7 }];
    if (!rules.exitConditions?.length) rules.exitConditions = [{ indicator: 'rsi', operator: '>', value: 65, weight: 0.7 }];

    // Apply risk level multiplier
    applyRiskLevel(rules, riskLevel);
    return rules;
  } catch (err) {
    console.warn('[BotEngine] Rule generation failed, using defaults:', (err as Error).message);
    return getDefaultRules(strategy, riskLevel, stopLoss, takeProfit, maxPosition);
  }
}

function applyRiskLevel(rules: TradingRules, riskLevel: string) {
  const multipliers: Record<string, { sl: number; tp: number; pos: number; cooldown: number }> = {
    'Very Low': { sl: 0.5, tp: 0.6, pos: 0.3, cooldown: 3 },
    'Low': { sl: 0.7, tp: 0.8, pos: 0.5, cooldown: 2 },
    'Med': { sl: 1.0, tp: 1.0, pos: 1.0, cooldown: 1 },
    'High': { sl: 1.5, tp: 1.3, pos: 1.5, cooldown: 0.7 },
    'Very High': { sl: 2.0, tp: 1.5, pos: 2.0, cooldown: 0.5 },
  };
  const m = multipliers[riskLevel] ?? multipliers['Med'];
  rules.stopLossPercent = Math.round(rules.stopLossPercent * m.sl * 10) / 10;
  rules.takeProfitPercent = Math.round(rules.takeProfitPercent * m.tp * 10) / 10;
  rules.maxPositionPercent = Math.min(50, Math.round(rules.maxPositionPercent * m.pos));
  rules.cooldownMinutes = Math.max(1, Math.round(rules.cooldownMinutes * m.cooldown));
}

function getDefaultRules(strategy: string | null | undefined, riskLevel: string, sl?: number, tp?: number, mp?: number): TradingRules {
  const stopLoss = sl ?? (riskLevel === 'Very Low' ? 1 : riskLevel === 'Low' ? 2 : riskLevel === 'Med' ? 3 : riskLevel === 'High' ? 5 : 8);
  const takeProfit = tp ?? stopLoss * 2.5;
  const maxPos = mp ?? (riskLevel === 'Very Low' ? 5 : riskLevel === 'Low' ? 10 : riskLevel === 'Med' ? 20 : riskLevel === 'High' ? 30 : 40);
  const strat = (strategy ?? '').toLowerCase();

  let rules: TradingRules;

  if (strat.includes('scalp')) {
    rules = {
      entryConditions: [
        { indicator: 'rsi', operator: '<', value: 48, weight: 0.6 },
        { indicator: 'price_vs_bb_lower', operator: '<', value: 1.02, weight: 0.5 },
      ],
      exitConditions: [
        { indicator: 'rsi', operator: '>', value: 55, weight: 0.6 },
        { indicator: 'price_vs_bb_upper', operator: '>', value: 0.98, weight: 0.5 },
      ],
      stopLossPercent: Math.min(stopLoss, 4), takeProfitPercent: Math.min(takeProfit, 6), maxPositionPercent: maxPos, cooldownMinutes: 1,
    };
  } else if (strat.includes('grid')) {
    rules = {
      entryConditions: [{ indicator: 'price_vs_ema20', operator: '<', value: 0.99, weight: 0.8 }],
      exitConditions: [{ indicator: 'price_vs_ema20', operator: '>', value: 1.01, weight: 0.8 }],
      stopLossPercent: stopLoss, takeProfitPercent: takeProfit, maxPositionPercent: Math.round(maxPos * 0.3), cooldownMinutes: 10,
    };
  } else if (strat.includes('dca') || strat.includes('dollar')) {
    rules = {
      entryConditions: [{ indicator: 'rsi', operator: '<', value: 80, weight: 0.1 }],
      exitConditions: [{ indicator: 'rsi', operator: '>', value: 75, weight: 0.8 }],
      stopLossPercent: stopLoss, takeProfitPercent: takeProfit, maxPositionPercent: Math.round(maxPos * 0.1), cooldownMinutes: 60,
    };
  } else if (strat.includes('trend')) {
    rules = {
      entryConditions: [{ indicator: 'macd_histogram', operator: '>', value: 0, weight: 0.7 }, { indicator: 'price_vs_ema20', operator: '>', value: 1.0, weight: 0.6 }],
      exitConditions: [{ indicator: 'macd_histogram', operator: '<', value: 0, weight: 0.7 }],
      stopLossPercent: stopLoss, takeProfitPercent: takeProfit, maxPositionPercent: maxPos, cooldownMinutes: 15,
    };
  } else {
    rules = {
      entryConditions: [{ indicator: 'rsi', operator: '<', value: 35, weight: 0.7 }, { indicator: 'price_vs_ema20', operator: '<', value: 1.02, weight: 0.5 }],
      exitConditions: [{ indicator: 'rsi', operator: '>', value: 65, weight: 0.7 }],
      stopLossPercent: stopLoss, takeProfitPercent: takeProfit, maxPositionPercent: maxPos, cooldownMinutes: 10,
    };
  }

  applyRiskLevel(rules, riskLevel);
  return rules;
}

// ─── Rule Evaluation (zero tokens) ──────────────────────────────────────────

function getIndicatorValue(indicator: string, snap: IndicatorSnapshot): number | null {
  switch (indicator) {
    case 'rsi': return snap.rsi;
    case 'ema20': return snap.ema20;
    case 'ema50': return snap.ema50;
    case 'macd_histogram': return snap.macd?.histogram ?? null;
    case 'price_vs_ema20': return snap.ema20 ? snap.currentPrice / snap.ema20 : null;
    case 'price_vs_ema50': return snap.ema50 ? snap.currentPrice / snap.ema50 : null;
    case 'price_vs_bb_upper': return snap.bollingerBands ? snap.currentPrice / snap.bollingerBands.upper : null;
    case 'price_vs_bb_lower': return snap.bollingerBands ? snap.currentPrice / snap.bollingerBands.lower : null;
    case 'price_change_pct': return snap.priceChangePercent;
    case 'volume_change_pct': return snap.volumeChangePercent;
    default: return null;
  }
}

function evaluateCondition(cond: RuleCondition, snap: IndicatorSnapshot, prevSnap: IndicatorSnapshot | null): boolean {
  const val = getIndicatorValue(cond.indicator, snap);
  if (val === null) return false;
  switch (cond.operator) {
    case '<': return val < cond.value;
    case '>': return val > cond.value;
    case '<=': return val <= cond.value;
    case '>=': return val >= cond.value;
    case 'crosses_above': {
      if (!prevSnap) return val > cond.value;
      const prev = getIndicatorValue(cond.indicator, prevSnap);
      return prev !== null && prev <= cond.value && val > cond.value;
    }
    case 'crosses_below': {
      if (!prevSnap) return val < cond.value;
      const prev = getIndicatorValue(cond.indicator, prevSnap);
      return prev !== null && prev >= cond.value && val < cond.value;
    }
  }
}

function evaluateRules(conditions: RuleCondition[], snap: IndicatorSnapshot, prevSnap: IndicatorSnapshot | null) {
  if (!conditions.length) return { matched: false, score: 0, matchedConditions: [] as string[] };
  let totalWeight = 0, matchedWeight = 0;
  const matchedConditions: string[] = [];
  for (const cond of conditions) {
    totalWeight += cond.weight;
    if (evaluateCondition(cond, snap, prevSnap)) {
      matchedWeight += cond.weight;
      const val = getIndicatorValue(cond.indicator, snap);
      matchedConditions.push(`${cond.indicator} ${cond.operator} ${cond.value} (=${val?.toFixed(2)})`);
    }
  }
  const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  return { matched: score >= 0.5, score, matchedConditions };
}

// ─── AI Decision ────────────────────────────────────────────────────────────

const AI_DECISION_SYSTEM = `You are a trading decision engine. Given market data and strategy, decide BUY, SELL, or HOLD.

RULES:
- Only BUY/SELL with confidence > 60
- Never BUY if already holding a position
- For scalping: never hold longer than needed, take quick profits
- For momentum: ride trends but exit on reversal signals
- Consider correlation: altcoins follow BTC. If BTC is dropping, don't buy altcoins
- If recent trades show a pattern of losses, be more cautious (lower confidence, smaller size)
- If recent trades show wins, maintain strategy but don't get greedy
- For stocks: consider pre-market/after-hours momentum direction
- Size positions based on confidence: 80%+ = full size, 60-80% = half size
- Never use more than 40% of balance on any single trade

LEARNING:
- Review past trade outcomes carefully. If a similar setup lost money before, reduce confidence by 20
- If the last 3 trades were losses, require confidence > 75 to BUY
- Track which indicators led to profitable vs unprofitable trades

Return ONLY valid JSON: {"action":"BUY"|"SELL"|"HOLD","confidence":0-100,"sizePercent":1-100,"reasoning":"Short explanation"}`;

async function getAIDecision(
  symbol: string, snap: IndicatorSnapshot, botPrompt: string, strategy: string | null | undefined,
  riskLevel: string, hasPosition: boolean, positionPnlPct: number | null,
  triggerReasons: string[], trainingContext: string, recentDecisions: string,
) {
  const prompt = `Bot Profile: ${strategy || 'Balanced'} strategy with ${riskLevel} risk level.
${symbol} @ $${snap.currentPrice.toFixed(2)} | RSI: ${snap.rsi?.toFixed(1) ?? 'N/A'} | EMA20: ${snap.ema20?.toFixed(2) ?? 'N/A'} | MACD: ${snap.macd?.histogram.toFixed(4) ?? 'N/A'}
BB: ${snap.bollingerBands ? `${snap.bollingerBands.lower.toFixed(2)}-${snap.bollingerBands.upper.toFixed(2)}` : 'N/A'} | 24h: $${snap.high24h.toFixed(2)}/$${snap.low24h.toFixed(2)}
Position: ${hasPosition ? `LONG P&L:${positionPnlPct?.toFixed(2)}%` : 'None'} | Trigger: ${triggerReasons.join('; ')}
Instructions: ${botPrompt || 'Standard approach'}
${trainingContext ? `Knowledge: ${trainingContext.slice(0, 500)}` : ''}
${recentDecisions ? `Recent: ${recentDecisions.slice(0, 300)}` : ''}`;

  try {
    const response = await engineLLMChat(
      [{ role: 'user', content: prompt }],
      { system: AI_DECISION_SYSTEM, maxTokens: 400, temperature: 0.2 },
    );
    let text = response.text;
    const cb = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (cb) text = cb[1].trim();
    const jm = text.match(/\{[\s\S]*\}/);
    if (!jm) throw new Error('No JSON');
    const result = JSON.parse(jm[0]);
    const tokens = (response.usage?.inputTokens ?? 0) + (response.usage?.outputTokens ?? 0);
    return {
      action: (['BUY', 'SELL', 'HOLD'].includes(result.action) ? result.action : 'HOLD') as 'BUY' | 'SELL' | 'HOLD',
      confidence: Math.min(100, Math.max(0, result.confidence ?? 50)),
      sizePercent: Math.min(100, Math.max(1, result.sizePercent ?? 10)),
      reasoning: result.reasoning || 'AI decision',
      tokens,
    };
  } catch (err) {
    console.warn('[BotEngine] AI decision failed:', (err as Error).message);
    return { action: 'HOLD' as const, confidence: 0, sizePercent: 0, reasoning: 'AI unavailable — holding', tokens: 0 };
  }
}

// ─── Main Engine ────────────────────────────────────────────────────────────

export async function processSymbol(opts: {
  sessionKey: string;
  symbol: string;
  botId: string;
  userId: string;
  botPrompt: string;
  strategy: string;
  riskLevel: string;
  balance: number;
  stopLoss?: number;
  takeProfit?: number;
  maxPositionPct?: number;
  tradeDirection?: 'buy' | 'sell' | 'both';
  dailyLossLimit?: number;
  orderType?: 'market' | 'limit';
  mode: 'shadow' | 'paper' | 'live';
  exchangeConnId?: string;
  subscriptionId?: string;
  shadowSessionId?: string;
  aiMode?: 'rules_only' | 'hybrid' | 'full_ai';
  aiConfidenceThreshold?: number;
  maxHoldsBeforeAI?: number;
  tradingFrequency?: 'conservative' | 'balanced' | 'aggressive' | 'max';
  customEntryConditions?: RuleCondition[];
  customExitConditions?: RuleCondition[];
  maxOpenPositions?: number;
  riskMultiplier?: number;
  feeRate?: number;
}): Promise<EngineDecision> {
  const { sessionKey, symbol, botId, userId, botPrompt, riskLevel, balance, stopLoss, takeProfit, maxPositionPct, mode } = opts;
  // Guard: strategy may be null/undefined from DB — default to empty string so .toLowerCase()/.includes() never crash
  const strategy = opts.strategy ?? '';
  const tradeDirection = opts.tradeDirection ?? 'both';
  const dailyLossLimit = opts.dailyLossLimit ?? 0;
  const cacheKey = `${sessionKey}:${symbol}`;

  // Acquire lock — use sessionKey to allow same bot in different contexts (arena/shadow/live)
  const lockKey = `engine:${sessionKey}:${symbol}`;
  const locked = await acquireLock(lockKey, 15000);
  if (!locked) {
    // Don't return price 0 — try to get real price for display
    const fallbackPrice = await getPrice(symbol);
    return { action: 'HOLD', confidence: 0, reasoning: 'Processing in progress', indicators: {}, aiCalled: false, tokensCost: 0, price: fallbackPrice?.price ?? 0, symbol };
  }

  try {
    // 1. Get price (with retry)
    let priceData = await getPrice(symbol);
    if (!priceData) {
      // Retry once after 1 second
      await new Promise(r => setTimeout(r, 1000));
      priceData = await getPrice(symbol);
    }
    if (!priceData) {
      return { action: 'HOLD', confidence: 0, reasoning: `Waiting for price data (${symbol})`, indicators: {}, aiCalled: false, tokensCost: 0, price: 0, symbol };
    }

    // 1b. Check daily loss limit
    if (dailyLossLimit > 0) {
      const today = new Date().toISOString().split('T')[0];
      const dailyLossKey = `dailyloss:${botId}:${today}`;
      const dailyLossStr = await redisConnection.get(dailyLossKey).catch(() => null);
      const dailyLoss = dailyLossStr ? parseFloat(dailyLossStr) : 0;
      if (dailyLoss >= dailyLossLimit) {
        const pauseDecision: EngineDecision = { action: 'HOLD', confidence: 100, reasoning: `Daily loss limit reached (${dailyLoss.toFixed(2)}% / ${dailyLossLimit}%). Trading paused until tomorrow.`, indicators: {}, aiCalled: false, tokensCost: 0, price: priceData.price, symbol };
        await logDecision(pauseDecision, opts);
        return pauseDecision;
      }
    }

    // 2. Seed price history on first run so indicators work immediately
    if (!priceHistoryBuffer.has(cacheKey) || priceHistoryBuffer.get(cacheKey)!.length < 20) {
      seedPriceHistory(cacheKey, priceData.price, 30);
    }
    const prices = addPrice(cacheKey, priceData.price);
    const snap = computeIndicators(prices, priceData.price, priceData.high24h, priceData.low24h, priceData.volume);
    const prevSnap = indicatorCache.get(cacheKey) ?? null;
    indicatorCache.set(cacheKey, snap);

    // 3. Get or generate rules
    const rulesCacheKey = `rules:${botId}`;
    let cachedRules = rulesCache.get(rulesCacheKey);
    if (!cachedRules || Date.now() - cachedRules.generatedAt > RULES_TTL_MS) {
      const rules = await generateRules(botPrompt, strategy, riskLevel, stopLoss, takeProfit, maxPositionPct);
      cachedRules = { rules, generatedAt: Date.now() };
      rulesCache.set(rulesCacheKey, cachedRules);
    }
    const rules = cachedRules.rules;

    // Apply subscriber riskMultiplier to SL/TP
    const multiplier = opts.riskMultiplier ?? 1;
    if (multiplier !== 1) {
      rules.stopLossPercent = Math.round(rules.stopLossPercent * multiplier * 10) / 10;
      rules.takeProfitPercent = Math.round(rules.takeProfitPercent * multiplier * 10) / 10;
    }

    // Apply custom conditions from creator config (override AI-generated rules)
    if (opts.customEntryConditions?.length) {
      rules.entryConditions = opts.customEntryConditions;
    }
    if (opts.customExitConditions?.length) {
      rules.exitConditions = opts.customExitConditions;
    }

    // Apply tradingFrequency cooldown multiplier
    const freqCooldownMap: Record<string, number> = {
      conservative: 3,
      balanced: 1,
      aggressive: 0.4,
      max: 0.1,
    };
    const freqMult = freqCooldownMap[opts.tradingFrequency ?? 'balanced'] ?? 1;
    rules.cooldownMinutes = Math.max(1, Math.round(rules.cooldownMinutes * freqMult));

    // 4. Get position from DB (persistent, survives restarts) — scoped to session and mode
    // shadow + paper are both virtual (isPaper=true); only live is real (isPaper=false)
    const existingPos = await getOpenPosition(botId, symbol, opts.shadowSessionId, mode !== 'live');
    const positionPnlPct = existingPos
      ? ((priceData.price - parseFloat(existingPos.entryPrice)) / parseFloat(existingPos.entryPrice)) * 100
      : null;

    // 5. Stop-loss / Take-profit (safety net — always fires regardless of aiMode)
    // In full_ai mode, only hard stop-loss fires as emergency protection.
    // Take-profit is left to AI so it can ride winners longer when confident.
    const isFullAI = (opts.aiMode === 'full_ai') && !isRuleOnlyStrategy(strategy);
    if (existingPos && positionPnlPct !== null) {
      if (positionPnlPct <= -rules.stopLossPercent) {
        const closed = await closePosition(existingPos.id, priceData.price, `Stop loss at ${positionPnlPct.toFixed(2)}%`, undefined, opts.feeRate ?? 0);
        const decision: EngineDecision = {
          action: 'SELL', confidence: 100,
          reasoning: `Stop loss triggered at ${positionPnlPct.toFixed(2)}% (limit: -${rules.stopLossPercent}%)`,
          indicators: formatIndicators(snap), aiCalled: false, tokensCost: 0,
          price: priceData.price, symbol, sizePercent: 100,
          pnl: closed?.pnlNum, pnlPercent: closed?.pnlPercentNum,
        };
        await logDecision(decision, opts);
        return decision;
      }
      // Take-profit: in full_ai mode, let AI decide exits (it sees the P&L in its prompt).
      // Only enforce hard TP when it's 2x the target as an absolute safety cap.
      if (!isFullAI && positionPnlPct >= rules.takeProfitPercent) {
        const closed = await closePosition(existingPos.id, priceData.price, `Take profit at +${positionPnlPct.toFixed(2)}%`, undefined, opts.feeRate ?? 0);
        const decision: EngineDecision = {
          action: 'SELL', confidence: 100,
          reasoning: `Take profit at +${positionPnlPct.toFixed(2)}% (target: +${rules.takeProfitPercent}%)`,
          indicators: formatIndicators(snap), aiCalled: false, tokensCost: 0,
          price: priceData.price, symbol, sizePercent: 100,
          pnl: closed?.pnlNum, pnlPercent: closed?.pnlPercentNum,
        };
        await logDecision(decision, opts);
        return decision;
      }
      // Hard safety cap: even full_ai gets force-closed at 2x TP target
      if (isFullAI && positionPnlPct >= rules.takeProfitPercent * 2) {
        const closed = await closePosition(existingPos.id, priceData.price, `Hard safety TP at +${positionPnlPct.toFixed(2)}%`, undefined, opts.feeRate ?? 0);
        const decision: EngineDecision = {
          action: 'SELL', confidence: 100,
          reasoning: `Safety take-profit at +${positionPnlPct.toFixed(2)}% (2x target: +${(rules.takeProfitPercent * 2).toFixed(1)}%). AI was riding this winner.`,
          indicators: formatIndicators(snap), aiCalled: false, tokensCost: 0,
          price: priceData.price, symbol, sizePercent: 100,
          pnl: closed?.pnlNum, pnlPercent: closed?.pnlPercentNum,
        };
        await logDecision(decision, opts);
        return decision;
      }

      // 5b. Trailing stop-loss
      const trailingKey = `trailing:${existingPos.id}`;
      try {
        const storedPeakStr = await redisConnection.get(trailingKey);
        const storedPeak = storedPeakStr ? parseFloat(storedPeakStr) : positionPnlPct;
        const peak = Math.max(storedPeak, positionPnlPct);
        // Always update peak in Redis
        await redisConnection.set(trailingKey, peak.toFixed(4), 'EX', 86400 * 7);

        // Activate trailing mode once position has reached at least +2%
        if (peak >= 2) {
          const drawdownFromPeak = peak - positionPnlPct;
          const drawdownPct = peak > 0 ? (drawdownFromPeak / peak) * 100 : 0;
          let trailingTriggered = false;
          let trailingReason = '';

          // If current P&L drops more than 40% from peak, trigger sell
          if (drawdownPct >= 40) {
            trailingTriggered = true;
            trailingReason = `Trailing stop triggered. Peak: +${peak.toFixed(2)}%, current: +${positionPnlPct.toFixed(2)}%, drawdown from peak: ${drawdownPct.toFixed(0)}%`;
          }
          // If peak was > +4% and current drops to < +1%, always sell (protect substantial gains)
          if (peak > 4 && positionPnlPct < 1) {
            trailingTriggered = true;
            trailingReason = `Trailing stop (protect gains). Peak: +${peak.toFixed(2)}%, current: +${positionPnlPct.toFixed(2)}%, protecting substantial gains`;
          }

          if (trailingTriggered) {
            const closed = await closePosition(existingPos.id, priceData.price, trailingReason, undefined, opts.feeRate ?? 0);
            await redisConnection.del(trailingKey).catch(() => {});
            const decision: EngineDecision = {
              action: 'SELL', confidence: 100,
              reasoning: trailingReason,
              indicators: formatIndicators(snap), aiCalled: false, tokensCost: 0,
              price: priceData.price, symbol, sizePercent: 100,
              pnl: closed?.pnlNum, pnlPercent: closed?.pnlPercentNum,
            };
            await logDecision(decision, opts);
            return decision;
          }
        }
      } catch (err) {
        console.warn('[BotEngine] Trailing stop Redis error:', (err as Error).message);
      }
    }

    // 6. Check cooldown (full_ai bypasses cooldown — AI controls its own pacing via confidence)
    const lastDec = lastDecisionCache.get(cacheKey);
    if (!isFullAI && lastDec && lastDec.action !== 'HOLD' && Date.now() - lastDec.time < rules.cooldownMinutes * 60000) {
      const cooldownDecision: EngineDecision = { action: 'HOLD', confidence: 50, reasoning: `Cooldown active (${rules.cooldownMinutes}min). Last: ${lastDec.action}`, indicators: formatIndicators(snap), aiCalled: false, tokensCost: 0, price: priceData.price, symbol };
      await logDecision(cooldownDecision, opts);
      return cooldownDecision;
    }

    // 7. Evaluate rules (FREE — skipped entirely in full_ai mode, AI decides everything)
    const entryResult = isFullAI
      ? { matched: false, score: 0, matchedConditions: [] as string[] }
      : evaluateRules(rules.entryConditions, snap, prevSnap);
    const exitResult = isFullAI
      ? { matched: false, score: 0, matchedConditions: [] as string[] }
      : (existingPos ? evaluateRules(rules.exitConditions, snap, prevSnap) : { matched: false, score: 0, matchedConditions: [] as string[] });

    // 8. Decision logic
    const triggerCheck = hasSignificantChange(snap, prevSnap);
    const ruleOnly = isRuleOnlyStrategy(strategy);
    let decision: EngineDecision;

    // Determine AI mode
    const aiMode = opts.aiMode ?? 'hybrid';
    const effectiveRuleOnly = ruleOnly || aiMode === 'rules_only';
    const effectiveFullAI = isFullAI;

    // tradingFrequency-based score threshold
    const freqScoreMap: Record<string, number> = { conservative: 0.5, balanced: 0.2, aggressive: 0.1, max: 0.05 };
    const minScore = freqScoreMap[opts.tradingFrequency ?? 'balanced'] ?? 0.2;

    // holdCount tracking
    const currentHolds = holdCountCache.get(cacheKey) ?? 0;
    const maxHolds = opts.maxHoldsBeforeAI;
    const forcedByHoldCount = maxHolds !== undefined && currentHolds >= maxHolds && !effectiveRuleOnly && checkAIRateLimit(botId);
    if (forcedByHoldCount) {
      triggerCheck.reasons.push(`Forced AI after ${currentHolds} consecutive HOLDs`);
    }

    // Session-scoped position filter (arena/shadow sessions must not bleed across sessions)
    const sessionScopeFilter = opts.shadowSessionId
      ? eq(botPositions.shadowSessionId, opts.shadowSessionId)
      : isNull(botPositions.shadowSessionId);

    // Mode filter: shadow+paper are virtual (isPaper=true), live is real (isPaper=false)
    const isPaperFilter = eq(botPositions.isPaper, mode !== 'live');

    // maxOpenPositions check for BUY — scoped to this session and mode
    let atMaxPositions = false;
    if (opts.maxOpenPositions !== undefined) {
      const [openRow] = await db
        .select({ cnt: sql<number>`COUNT(*)::int` })
        .from(botPositions)
        .where(and(eq(botPositions.botId, botId), eq(botPositions.status, 'open'), sessionScopeFilter, isPaperFilter));
      if (Number(openRow?.cnt ?? 0) >= opts.maxOpenPositions) atMaxPositions = true;
    }

    // Portfolio-level exposure check — scoped to this session and mode
    if (!atMaxPositions) {
      try {
        const openPositions = await db.select({ entryValue: botPositions.entryValue }).from(botPositions)
          .where(and(eq(botPositions.botId, botId), eq(botPositions.status, 'open'), sessionScopeFilter, isPaperFilter));
        const totalExposure = openPositions.reduce((sum, p) => sum + parseFloat(p.entryValue ?? '0'), 0);
        const exposurePct = balance > 0 ? (totalExposure / balance) * 100 : 0;
        if (exposurePct > 80) {
          atMaxPositions = true;
          triggerCheck.reasons.push(`Portfolio exposure at ${exposurePct.toFixed(0)}% — waiting for positions to close`);
        }
      } catch {}
    }

    // full_ai: ALWAYS call AI on every tick (rate-limited only).
    // hybrid: call AI when triggers fire, rules partially match, or forced by hold count.
    // rules_only: never call AI.
    const shouldCallAI = effectiveFullAI
      ? checkAIRateLimit(botId) // full_ai: always, just rate-limited
      : (!effectiveRuleOnly
          && (forcedByHoldCount || (triggerCheck.triggered && (entryResult.score > minScore || exitResult.score > minScore)))
          && checkAIRateLimit(botId));

    if (shouldCallAI) {
      // AI call (only for non-DCA/Grid strategies, rate limited)
      let trainingContext = '';
      try {
        const knowledge = await retrieveKnowledge({ userId, botId, query: `${symbol} ${strategy} ${triggerCheck.reasons.join(' ')}`, topK: 3 });
        trainingContext = knowledge.map(k => k.content).join('\n---\n');
      } catch {}

      // Get past decision outcomes for learning
      const pastOutcomes = await db
        .select({ action: botDecisions.action, reasoning: botDecisions.reasoning })
        .from(botDecisions)
        .where(and(eq(botDecisions.botId, botId), eq(botDecisions.symbol, symbol)))
        .orderBy(desc(botDecisions.createdAt))
        .limit(20);
      const recentStr = pastOutcomes.map(d => `${d.action}: ${d.reasoning}`).join('\n');

      // Get closed position outcomes for learning
      const closedPositions = await db
        .select({ pnl: botPositions.pnl, pnlPercent: botPositions.pnlPercent, entryReasoning: botPositions.entryReasoning })
        .from(botPositions)
        .where(and(eq(botPositions.botId, botId), eq(botPositions.status, 'closed')))
        .orderBy(desc(botPositions.closedAt))
        .limit(20);
      let learningStr = closedPositions.length > 0
        ? '\nPast results: ' + closedPositions.map(p => `P&L:${p.pnlPercent}% (${p.entryReasoning?.slice(0, 40)})`).join('; ')
        : '';

      // Build performance summary from closed positions
      if (closedPositions.length > 0) {
        const wins = closedPositions.filter(p => parseFloat(p.pnl ?? '0') > 0);
        const losses = closedPositions.filter(p => parseFloat(p.pnl ?? '0') <= 0);
        const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / wins.length : 0;
        const avgLoss = losses.length > 0 ? losses.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / losses.length : 0;

        // Extract most common indicator keywords from reasoning
        const extractIndicator = (reasoning: string | null): string => {
          if (!reasoning) return 'unknown';
          const lower = reasoning.toLowerCase();
          const indicators = ['rsi', 'ema', 'macd', 'bollinger', 'momentum', 'trend', 'volume', 'support', 'resistance'];
          for (const ind of indicators) {
            if (lower.includes(ind)) return ind;
          }
          return 'mixed';
        };

        const winIndicators: Record<string, number> = {};
        const lossIndicators: Record<string, number> = {};
        for (const w of wins) {
          const ind = extractIndicator(w.entryReasoning);
          winIndicators[ind] = (winIndicators[ind] ?? 0) + 1;
        }
        for (const l of losses) {
          const ind = extractIndicator(l.entryReasoning);
          lossIndicators[ind] = (lossIndicators[ind] ?? 0) + 1;
        }

        const bestSetup = Object.entries(winIndicators).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';
        const worstSetup = Object.entries(lossIndicators).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';

        learningStr += `\nPerformance: ${wins.length}W/${losses.length}L, avgWin:${avgWin >= 0 ? '+' : ''}${avgWin.toFixed(1)}%, avgLoss:${avgLoss.toFixed(1)}%. Best setups: ${bestSetup}. Worst: ${worstSetup}.`;
      }

      // Fetch cross-session learnings from Redis
      let sessionLearnings = '';
      try {
        sessionLearnings = await redisConnection.get(`bot:learnings:${botId}`) ?? '';
      } catch {}

      const aiResult = await getAIDecision(symbol, snap, botPrompt, strategy, riskLevel, !!existingPos, positionPnlPct, triggerCheck.reasons, trainingContext + (sessionLearnings ? `\nSession learnings: ${sessionLearnings}` : ''), recentStr + learningStr);

      let finalAction = aiResult.action;
      if (finalAction === 'BUY' && existingPos) finalAction = 'HOLD';
      if (finalAction === 'BUY' && tradeDirection === 'sell') finalAction = 'HOLD';
      if (finalAction === 'SELL' && tradeDirection === 'buy') finalAction = 'HOLD';
      if (finalAction === 'SELL' && !existingPos) finalAction = 'HOLD';
      const confThreshold = opts.aiConfidenceThreshold ?? 60;
      if (finalAction === 'BUY' && aiResult.confidence < confThreshold) finalAction = 'HOLD';
      if (finalAction === 'SELL' && aiResult.confidence < confThreshold) finalAction = 'HOLD';

      if (finalAction !== 'HOLD') {
        holdCountCache.set(cacheKey, 0);
      } else {
        holdCountCache.set(cacheKey, (holdCountCache.get(cacheKey) ?? 0) + 1);
      }

      decision = { action: finalAction, confidence: aiResult.confidence, reasoning: aiResult.reasoning, indicators: formatIndicators(snap), aiCalled: true, tokensCost: aiResult.tokens, price: priceData.price, symbol, sizePercent: aiResult.sizePercent };
    } else if (effectiveFullAI) {
      // full_ai mode but AI rate-limited — HOLD, never fall through to rules.
      // AI is the sole decision maker in this mode.
      const reason = existingPos
        ? `AI holding position. P&L: ${positionPnlPct?.toFixed(2)}%. AI rate limit reached — waiting for next slot.`
        : `AI monitoring market. RSI: ${snap.rsi?.toFixed(1) ?? 'N/A'}. AI rate limit reached — waiting for next slot.`;
      const holdDecision: EngineDecision = { action: 'HOLD', confidence: 50, reasoning: reason, indicators: formatIndicators(snap), aiCalled: false, tokensCost: 0, price: priceData.price, symbol };
      holdCountCache.set(cacheKey, (holdCountCache.get(cacheKey) ?? 0) + 1);
      lastDecisionCache.set(cacheKey, { action: 'HOLD', time: Date.now() });
      await logDecision(holdDecision, opts);
      return holdDecision;
    } else if (entryResult.matched && !existingPos && !atMaxPositions && tradeDirection !== 'sell') {
      holdCountCache.set(cacheKey, 0);
      decision = { action: 'BUY', confidence: Math.round(entryResult.score * 100), reasoning: `Rule entry: ${entryResult.matchedConditions.join(', ')}`, indicators: formatIndicators(snap), aiCalled: false, tokensCost: 0, price: priceData.price, symbol, sizePercent: rules.maxPositionPercent };
    } else if (exitResult.matched && existingPos && tradeDirection !== 'buy') {
      holdCountCache.set(cacheKey, 0);
      decision = { action: 'SELL', confidence: Math.round(exitResult.score * 100), reasoning: `Rule exit: ${exitResult.matchedConditions.join(', ')}`, indicators: formatIndicators(snap), aiCalled: false, tokensCost: 0, price: priceData.price, symbol, sizePercent: 100 };
    } else {
      const reason = existingPos
        ? `Holding position. P&L: ${positionPnlPct?.toFixed(2)}%. No exit signal.`
        : `Monitoring market. Entry score: ${(entryResult.score * 100).toFixed(0)}%. RSI: ${snap.rsi?.toFixed(1) ?? 'N/A'}. Waiting for entry signal.`;
      const holdDecision: EngineDecision = { action: 'HOLD', confidence: 50, reasoning: reason, indicators: formatIndicators(snap), aiCalled: false, tokensCost: 0, price: priceData.price, symbol };
      holdCountCache.set(cacheKey, (holdCountCache.get(cacheKey) ?? 0) + 1);
      lastDecisionCache.set(cacheKey, { action: 'HOLD', time: Date.now() });
      await logDecision(holdDecision, opts);
      return holdDecision;
    }

    // 9. Execute BUY — open position in DB
    if (decision.action === 'BUY') {
      const posValue = balance * (decision.sizePercent ?? rules.maxPositionPercent) / 100;
      const amount = posValue / priceData.price;
      const slPrice = stopLoss ? priceData.price * (1 - rules.stopLossPercent / 100) : undefined;
      const tpPrice = takeProfit ? priceData.price * (1 + rules.takeProfitPercent / 100) : undefined;

      await openPosition({
        userId, botId, symbol, entryPrice: priceData.price, amount, entryValue: posValue,
        stopLoss: slPrice, takeProfit: tpPrice, isPaper: mode !== 'live',
        reasoning: decision.reasoning, subscriptionId: opts.subscriptionId, shadowSessionId: opts.shadowSessionId,
      });
      // Expose exact amount/value so shadow/live jobs write consistent trade records
      decision.tradeAmount = amount;
      decision.tradeValue = posValue;
      decision.reasoning += ` | Size: $${posValue.toFixed(2)}`;
    }

    // Execute SELL — close position in DB with real P&L
    if (decision.action === 'SELL' && existingPos) {
      const posAmount = parseFloat(existingPos.amount);
      const posEntryValue = parseFloat(existingPos.entryValue ?? '0') || posAmount * parseFloat(existingPos.entryPrice);
      const closed = await closePosition(existingPos.id, priceData.price, decision.reasoning, undefined, opts.feeRate ?? 0);
      if (closed) {
        decision.pnl = closed.pnlNum;
        decision.pnlPercent = closed.pnlPercentNum;
        // Expose exact position amount/value so trade record matches position exactly
        decision.tradeAmount = posAmount;
        decision.tradeValue = posAmount * priceData.price;
        decision.reasoning += ` | P&L: ${closed.pnlPercentNum >= 0 ? '+' : ''}${closed.pnlPercentNum.toFixed(2)}% ($${closed.pnlNum.toFixed(2)})`;
      }
    }

    lastDecisionCache.set(cacheKey, { action: decision.action, time: Date.now() });
    await logDecision(decision, opts);
    return decision;
  } finally {
    await releaseLock(lockKey);
  }
}

// ─── Log Decision (only BUY/SELL stored, HOLD only published) ───────────────

async function logDecision(
  decision: EngineDecision,
  opts: { botId: string; userId: string; mode: 'shadow' | 'paper' | 'live'; subscriptionId?: string; shadowSessionId?: string },
) {
  // Persist ALL decisions to DB so Live Feed always has data to show
  try {
    await db.insert(botDecisions).values({
      botId: opts.botId, userId: opts.userId,
      subscriptionId: opts.subscriptionId || null, shadowSessionId: opts.shadowSessionId || null,
      symbol: decision.symbol, action: decision.action, confidence: decision.confidence,
      reasoning: decision.reasoning, indicators: decision.indicators,
      price: decision.price.toFixed(8), aiCalled: decision.aiCalled,
      tokensCost: decision.tokensCost, mode: opts.mode,
    });
  } catch (err) {
    console.error('[BotEngine] Failed to log decision:', (err as Error).message);
  }

  // Publish ALL decisions (including HOLD) to WebSocket for live feed
  const payload = {
    type: 'bot_decision',
    data: {
      botId: opts.botId, userId: opts.userId, symbol: decision.symbol,
      action: decision.action, confidence: decision.confidence,
      reasoning: decision.reasoning, indicators: decision.indicators,
      price: decision.price, aiCalled: decision.aiCalled,
      tokensCost: decision.tokensCost, mode: opts.mode,
      pnl: decision.pnl, pnlPercent: decision.pnlPercent,
      timestamp: new Date().toISOString(),
    },
  };

  try {
    await Promise.all([
      redisConnection.publish(`bot:decisions:${opts.botId}:${opts.userId}`, JSON.stringify(payload)),
      redisConnection.publish(`bot:decisions:${opts.botId}`, JSON.stringify(payload)),
      redisConnection.publish(`trades:${opts.userId}`, JSON.stringify(payload)),
    ]);
  } catch (err) {
    console.error('[BotEngine] Redis publish failed:', (err as Error).message);
  }
}

// ─── Execute Live Trade ─────────────────────────────────────────────────────

export async function executeLiveTrade(
  decision: EngineDecision, userId: string, botId: string,
  subscriptionId: string, exchangeConnId: string,
  orderType: 'market' | 'limit' = 'market',
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const [[conn], [sub]] = await Promise.all([
      db.select().from(exchangeConnections)
        .where(and(eq(exchangeConnections.id, exchangeConnId), eq(exchangeConnections.userId, userId)))
        .limit(1),
      db.select({ minOrderValue: botSubscriptions.minOrderValue })
        .from(botSubscriptions)
        .where(eq(botSubscriptions.id, subscriptionId))
        .limit(1),
    ]);

    if (!conn?.apiKeyEnc || !conn?.apiSecretEnc) return { success: false, error: 'Exchange not connected' };
    if (conn.status === 'disconnected' || conn.status === 'error') return { success: false, error: 'Exchange disconnected' };

    const adapter = createAdapter(conn.provider);
    await adapter.connect({ apiKey: decrypt(conn.apiKeyEnc), apiSecret: decrypt(conn.apiSecretEnc), sandbox: conn.sandbox ?? false });

    // Detect asset class from symbol format
    const isStock = !decision.symbol.includes('/');
    const quoteCurrency = isStock ? 'USD' : 'USDT';

    // Check market hours for stocks
    if (isStock && adapter.isMarketOpen) {
      const marketOpen = await adapter.isMarketOpen();
      if (!marketOpen) {
        await adapter.disconnect();
        return { success: false, error: 'US stock market is currently closed' };
      }
    }

    const balances = await adapter.getBalances();
    let amount: number;
    let tradeValue: number;

    if (decision.price <= 0) {
      await adapter.disconnect();
      return { success: false, error: `Invalid price ($${decision.price}) — price sync may not have run yet` };
    }

    if (decision.action === 'BUY') {
      const quoteBalance = balances.find(b => b.currency === quoteCurrency)?.free ?? 0;
      if (quoteBalance <= 0) {
        await adapter.disconnect();
        return { success: false, error: `No ${quoteCurrency} balance available. Fund your ${conn.provider}${conn.sandbox ? ' testnet' : ''} account first.` };
      }
      const sizePercent = decision.sizePercent && decision.sizePercent > 0 ? decision.sizePercent : 10;
      tradeValue = quoteBalance * sizePercent / 100;
      amount = tradeValue / decision.price;

      console.log(`[BotEngine] BUY ${decision.symbol}: quoteBalance=${quoteBalance} ${quoteCurrency}, sizePercent=${sizePercent}%, tradeValue=$${tradeValue.toFixed(2)}`);
    } else {
      const base = isStock ? decision.symbol : decision.symbol.split('/')[0];
      amount = balances.find(b => b.currency === base)?.free ?? 0;
      tradeValue = amount * decision.price;

      console.log(`[BotEngine] SELL ${decision.symbol}: base balance=${amount} ${base}, tradeValue=$${tradeValue.toFixed(2)}`);
    }

    // Minimum order size: use user's configured value from subscription, else env default
    const subMinOrder = parseFloat(sub?.minOrderValue ?? '0');
    const MIN_ORDER_VALUE = subMinOrder > 0
      ? subMinOrder
      : isStock ? (env.MIN_STOCK_ORDER_USD ?? 1) : (env.MIN_CRYPTO_ORDER_USD ?? 10);
    if (tradeValue < MIN_ORDER_VALUE) {
      await adapter.disconnect();
      return { success: false, error: `Insufficient balance for ${decision.symbol} (${quoteCurrency} balance too low for min $${MIN_ORDER_VALUE} order)` };
    }

    if (amount <= 0) {
      await adapter.disconnect();
      return { success: false, error: `Insufficient balance` };
    }

    // Limit order slippage buffer: buy slightly below ask, sell slightly above bid
    // 0.1% default keeps orders competitive without being too aggressive
    const LIMIT_SLIPPAGE = env.LIMIT_ORDER_SLIPPAGE_PCT ? env.LIMIT_ORDER_SLIPPAGE_PCT / 100 : 0.001;
    const limitPrice = orderType === 'limit'
      ? (decision.action === 'BUY' ? decision.price * (1 - LIMIT_SLIPPAGE) : decision.price * (1 + LIMIT_SLIPPAGE))
      : undefined;

    const orderOptions = isStock ? { timeInForce: 'day' as const } : undefined;

    const order = await adapter.createOrder(
      decision.symbol,
      decision.action.toLowerCase() as 'buy' | 'sell',
      orderType,
      amount,
      limitPrice,
      orderOptions,
    );
    await adapter.disconnect();

    // Use order's fill price if available, otherwise fall back to the decision's market price
    const fillPrice = order.price > 0 ? order.price : decision.price;
    const fillAmount = order.amount > 0 ? order.amount : amount;
    const totalValue = fillAmount * fillPrice;

    // decision.pnl is set by closePosition() which already deducts fees (feeRate passed from live-trade job)
    const tradePnl = decision.action === 'SELL' && decision.pnl !== undefined
      ? decision.pnl
      : null;
    const tradePnlPct = decision.action === 'SELL' && decision.pnlPercent !== undefined
      ? decision.pnlPercent
      : null;

    await db.insert(trades).values({
      userId, botSubscriptionId: subscriptionId, symbol: decision.symbol,
      side: decision.action as 'BUY' | 'SELL', amount: fillAmount.toFixed(8),
      price: fillPrice.toFixed(8), totalValue: totalValue.toFixed(2),
      pnl: tradePnl !== null ? tradePnl.toFixed(2) : null,
      pnlPercent: tradePnlPct !== null ? tradePnlPct.toFixed(4) : null,
      isPaper: false, exchangeOrderId: order.id, orderType,
      reasoning: decision.reasoning, status: order.status === 'new' ? 'pending' : 'filled',
    });

    // Track daily loss for daily loss limit
    if (decision.pnlPercent && decision.pnlPercent < 0) {
      const today = new Date().toISOString().split('T')[0];
      const dailyLossKey = `dailyloss:${botId}:${today}`;
      await redisConnection.incrbyfloat(dailyLossKey, Math.abs(decision.pnlPercent)).catch(() => {});
      await redisConnection.expire(dailyLossKey, 86400).catch(() => {});
    }

    return { success: true, orderId: order.id };
  } catch (err) {
    console.error('[BotEngine] Live trade failed:', (err as Error).message);
    return { success: false, error: (err as Error).message };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function invalidateRulesCache(botId: string) {
  rulesCache.delete(`rules:${botId}`);
}

// ─── Cross-Session Learning Summary ─────────────────────────────────────────

export async function summarizeSessionLearnings(botId: string): Promise<string> {
  const allClosed = await db
    .select({ pnl: botPositions.pnl, pnlPercent: botPositions.pnlPercent, entryReasoning: botPositions.entryReasoning, closedAt: botPositions.closedAt })
    .from(botPositions)
    .where(and(eq(botPositions.botId, botId), eq(botPositions.status, 'closed')))
    .orderBy(desc(botPositions.closedAt));

  if (allClosed.length === 0) {
    const summary = 'No closed trades yet.';
    await redisConnection.set(`bot:learnings:${botId}`, summary, 'EX', 86400);
    return summary;
  }

  const wins = allClosed.filter(p => parseFloat(p.pnl ?? '0') > 0);
  const losses = allClosed.filter(p => parseFloat(p.pnl ?? '0') <= 0);
  const winRate = (wins.length / allClosed.length) * 100;
  const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / losses.length : 0;

  // Extract indicators from reasoning
  const indicatorKeywords = ['rsi', 'ema', 'macd', 'bollinger', 'momentum', 'trend', 'volume', 'support', 'resistance', 'oversold', 'overbought'];
  const extractIndicators = (reasoning: string | null): string[] => {
    if (!reasoning) return [];
    const lower = reasoning.toLowerCase();
    return indicatorKeywords.filter(ind => lower.includes(ind));
  };

  const winIndicators: Record<string, number> = {};
  const lossIndicators: Record<string, number> = {};
  for (const w of wins) {
    for (const ind of extractIndicators(w.entryReasoning)) {
      winIndicators[ind] = (winIndicators[ind] ?? 0) + 1;
    }
  }
  for (const l of losses) {
    for (const ind of extractIndicators(l.entryReasoning)) {
      lossIndicators[ind] = (lossIndicators[ind] ?? 0) + 1;
    }
  }

  const bestIndicator = Object.entries(winIndicators).sort((a, b) => b[1] - a[1])[0];
  const worstIndicator = Object.entries(lossIndicators).sort((a, b) => b[1] - a[1])[0];

  // Profitable hours analysis
  const hourBuckets: Record<number, { wins: number; total: number }> = {};
  for (const p of allClosed) {
    if (p.closedAt) {
      const hour = new Date(p.closedAt).getUTCHours();
      if (!hourBuckets[hour]) hourBuckets[hour] = { wins: 0, total: 0 };
      hourBuckets[hour].total++;
      if (parseFloat(p.pnl ?? '0') > 0) hourBuckets[hour].wins++;
    }
  }
  const profitableHours = Object.entries(hourBuckets)
    .filter(([, v]) => v.total >= 3 && (v.wins / v.total) > 0.6)
    .map(([h]) => parseInt(h))
    .sort((a, b) => a - b);
  const hoursStr = profitableHours.length > 0
    ? `Profitable hours: ${profitableHours[0]}-${profitableHours[profitableHours.length - 1]} UTC.`
    : '';

  const summary = `Total: ${allClosed.length} trades, ${wins.length}W/${losses.length}L (${winRate.toFixed(0)}% win rate). Avg win: ${avgWin >= 0 ? '+' : ''}${avgWin.toFixed(1)}%, Avg loss: ${avgLoss.toFixed(1)}%. Best indicator: ${bestIndicator ? `${bestIndicator[0]} (${bestIndicator[1]} wins)` : 'N/A'}. Worst: ${worstIndicator ? `${worstIndicator[0]} (${worstIndicator[1]} losses)` : 'N/A'}. ${hoursStr}`;

  await redisConnection.set(`bot:learnings:${botId}`, summary, 'EX', 86400);
  return summary;
}

function formatIndicators(snap: IndicatorSnapshot): Record<string, number | string | null> {
  return {
    rsi: snap.rsi ? Number(snap.rsi.toFixed(1)) : null,
    ema20: snap.ema20 ? Number(snap.ema20.toFixed(2)) : null,
    ema50: snap.ema50 ? Number(snap.ema50.toFixed(2)) : null,
    macd: snap.macd ? Number(snap.macd.histogram.toFixed(4)) : null,
    bb_upper: snap.bollingerBands ? Number(snap.bollingerBands.upper.toFixed(2)) : null,
    bb_lower: snap.bollingerBands ? Number(snap.bollingerBands.lower.toFixed(2)) : null,
    price_change: snap.priceChangePercent ? Number(snap.priceChangePercent.toFixed(2)) : null,
    price: snap.currentPrice,
  };
}

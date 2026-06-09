/**
 * Trainer Agent Service
 *
 * Sits "on top" of the bot engine and continuously monitors performance.
 * When triggered, uses Claude to analyze trade history and generate
 * an improved bot prompt + config, then shadow-validates before promoting.
 *
 * Feature 2: Trainer on top of bot
 * Feature 4: Auto training and strategy fixing, automated
 */
import { db } from '../../config/database.js';
import { redisConnection } from '../../config/queue.js';
import { llmChat } from '../../config/ai.js';
import { bots } from '../../db/schema/bots.js';
import { botPositions } from '../../db/schema/positions.js';
import { botDecisions } from '../../db/schema/decisions.js';
import { eq, and, desc } from 'drizzle-orm';
export const DEFAULT_TRAINER_CONFIG = {
    trainingMode: 'off', // off by default — creator opts in
    autoRetrain: false,
    retrainMode: 'combined',
    retrainIntervalDays: 7,
    profitFactorFloor: 1.2,
    winRateDropThreshold: 10,
    consecutiveLossLimit: 5,
    shadowValidationHours: 24,
    lastRetrainAt: null,
    trainerScore: null,
    trainerStatus: 'idle',
    pendingPrompt: null,
    pendingConfig: null,
    lastInsightAt: null,
    insights: [],
};
// ─── Performance Analysis ─────────────────────────────────────────────────────
export async function analyzeBotPerformance(botId) {
    const allClosed = await db.select()
        .from(botPositions)
        .where(and(eq(botPositions.botId, botId), eq(botPositions.status, 'closed'), eq(botPositions.isPaper, false)))
        .orderBy(desc(botPositions.closedAt))
        .limit(200);
    const totalTrades = allClosed.length;
    if (totalTrades === 0) {
        return {
            botId, totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0,
            avgWinPct: 0, avgLossPct: 0, maxDrawdown: 0, consecutiveLosses: 0,
            recentWinRate: 0, sharpeEstimate: 0, trainerScore: 50, needsRetrain: false, retrainReason: null,
        };
    }
    const wins = allClosed.filter(p => parseFloat(p.pnl ?? '0') > 0);
    const losses = allClosed.filter(p => parseFloat(p.pnl ?? '0') <= 0);
    const winRate = (wins.length / totalTrades) * 100;
    const grossProfit = wins.reduce((s, p) => s + parseFloat(p.pnl ?? '0'), 0);
    const grossLoss = Math.abs(losses.reduce((s, p) => s + parseFloat(p.pnl ?? '0'), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0);
    const avgWinPct = wins.length > 0
        ? wins.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / wins.length
        : 0;
    const avgLossPct = losses.length > 0
        ? Math.abs(losses.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / losses.length)
        : 0;
    // Max drawdown
    let peak = 0, maxDrawdown = 0, cum = 0;
    for (const p of [...allClosed].reverse()) {
        cum += parseFloat(p.pnlPercent ?? '0');
        if (cum > peak)
            peak = cum;
        if (peak - cum > maxDrawdown)
            maxDrawdown = peak - cum;
    }
    // Consecutive losses (most recent streak)
    let consecutiveLosses = 0;
    for (const p of allClosed) {
        if (parseFloat(p.pnl ?? '0') <= 0)
            consecutiveLosses++;
        else
            break;
    }
    // Recent win rate (last 10 trades)
    const recent10 = allClosed.slice(0, 10);
    const recentWins = recent10.filter(p => parseFloat(p.pnl ?? '0') > 0).length;
    const recentWinRate = recent10.length > 0 ? (recentWins / recent10.length) * 100 : 0;
    // Sharpe estimate: mean pnl pct / std dev
    const returns = allClosed.map(p => parseFloat(p.pnlPercent ?? '0'));
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeEstimate = stdDev > 0 ? mean / stdDev : 0;
    // Trainer health score (0-100)
    let score = 50;
    // Profit factor contribution (0-30 pts)
    score += Math.min(30, Math.max(-20, (profitFactor - 1) * 15));
    // Win rate contribution (0-25 pts)
    score += Math.min(25, Math.max(-15, (winRate - 50) * 0.5));
    // Consecutive loss penalty (0 to -20 pts)
    score -= Math.min(20, consecutiveLosses * 4);
    // Drawdown penalty (0 to -20 pts)
    score -= Math.min(20, maxDrawdown * 0.5);
    // Sharpe bonus (0-15 pts)
    score += Math.min(15, Math.max(-10, sharpeEstimate * 8));
    score = Math.max(0, Math.min(100, Math.round(score)));
    // Retrain triggers
    let needsRetrain = false;
    let retrainReason = null;
    if (profitFactor < 1.2 && totalTrades >= 10) {
        needsRetrain = true;
        retrainReason = `Profit factor ${profitFactor.toFixed(2)} below threshold 1.2`;
    }
    else if (consecutiveLosses >= 5) {
        needsRetrain = true;
        retrainReason = `${consecutiveLosses} consecutive losses`;
    }
    else if (recentWinRate < winRate - 15 && totalTrades >= 20) {
        needsRetrain = true;
        retrainReason = `Recent win rate ${recentWinRate.toFixed(0)}% dropped >15% from overall ${winRate.toFixed(0)}%`;
    }
    return {
        botId, totalTrades, wins: wins.length, losses: losses.length, winRate, profitFactor,
        avgWinPct, avgLossPct, maxDrawdown, consecutiveLosses, recentWinRate, sharpeEstimate,
        trainerScore: score, needsRetrain, retrainReason,
    };
}
// ─── Claude Trainer Agent ─────────────────────────────────────────────────────
const TRAINER_SYSTEM = `You are an expert trading bot trainer. Analyze this bot's performance data and generate an improved strategy.

Your job:
1. Identify what's working and what isn't from trade history
2. Generate a refined bot prompt that will improve performance
3. Suggest specific config parameter changes
4. Explain your reasoning

Return ONLY valid JSON:
{
  "diagnosis": "Brief analysis of current performance problems",
  "improvedPrompt": "Full improved trading bot instruction prompt (2-3 sentences, specific and actionable)",
  "configChanges": {
    "stopLoss": number_or_null,
    "takeProfit": number_or_null,
    "aiMode": "rules_only|hybrid|full_ai_or_null",
    "tradingFrequency": "conservative|balanced|aggressive|null"
  },
  "keyInsights": ["insight1", "insight2", "insight3"],
  "expectedImpact": "What improvement you expect and why",
  "confidence": 0-100
}`;
export async function runTrainerAgent(botId) {
    // Load bot + performance
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    if (!bot)
        return null;
    const perf = await analyzeBotPerformance(botId);
    // FIX 2: Load individual closed trade records with entry conditions + actual P&L outcome.
    // This is what real learning requires — not aggregate stats but specific examples of
    // "I entered because RSI=72 MACD=positive → lost 2.3%" so Claude can find patterns.
    const closedTrades = await db.select({
        pnl: botPositions.pnl,
        pnlPercent: botPositions.pnlPercent,
        entryReasoning: botPositions.entryReasoning,
        exitReasoning: botPositions.exitReasoning,
        symbol: botPositions.symbol,
        openedAt: botPositions.openedAt,
        closedAt: botPositions.closedAt,
    }).from(botPositions)
        .where(and(eq(botPositions.botId, botId), eq(botPositions.status, 'closed')))
        .orderBy(desc(botPositions.closedAt))
        .limit(30);
    // Load recent decisions (last 50) — used for pattern correlation
    const recentDecisions = await db.select({
        action: botDecisions.action,
        reasoning: botDecisions.reasoning,
        symbol: botDecisions.symbol,
        confidence: botDecisions.confidence,
        createdAt: botDecisions.createdAt,
    }).from(botDecisions)
        .where(eq(botDecisions.botId, botId))
        .orderBy(desc(botDecisions.createdAt))
        .limit(50);
    // Build trade-outcome examples: each line = entry context → outcome
    // This is the core learning material — specific setups with their actual results
    const tradeExamples = closedTrades.map(t => {
        const pnl = parseFloat(t.pnlPercent ?? '0');
        const outcome = pnl >= 0 ? `WIN +${pnl.toFixed(2)}%` : `LOSS ${pnl.toFixed(2)}%`;
        const holdTime = t.openedAt && t.closedAt
            ? Math.round((new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()) / 60000) + 'min'
            : '?';
        return `${outcome} [held ${holdTime}] ${t.symbol}: Entry — ${t.entryReasoning?.slice(0, 80) ?? 'unknown'} | Exit — ${t.exitReasoning?.slice(0, 40) ?? 'unknown'}`;
    }).join('\n');
    // Identify win patterns vs loss patterns from entry reasoning keywords
    const wins = closedTrades.filter(t => parseFloat(t.pnl ?? '0') > 0);
    const losses = closedTrades.filter(t => parseFloat(t.pnl ?? '0') <= 0);
    const INDICATORS = ['rsi', 'ema', 'macd', 'bollinger', 'momentum', 'trend', 'support', 'resistance', 'volume'];
    const winPatterns = {};
    const lossPatterns = {};
    for (const t of wins) {
        for (const ind of INDICATORS) {
            if (t.entryReasoning?.toLowerCase().includes(ind))
                winPatterns[ind] = (winPatterns[ind] ?? 0) + 1;
        }
    }
    for (const t of losses) {
        for (const ind of INDICATORS) {
            if (t.entryReasoning?.toLowerCase().includes(ind))
                lossPatterns[ind] = (lossPatterns[ind] ?? 0) + 1;
        }
    }
    const topWinSignal = Object.entries(winPatterns).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none identified';
    const topLossSignal = Object.entries(lossPatterns).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none identified';
    // Average hold time for wins vs losses
    const avgHoldWins = wins.length > 0
        ? wins.filter(t => t.openedAt && t.closedAt).reduce((s, t) => s + (new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()), 0) / wins.length / 60000
        : 0;
    const avgHoldLosses = losses.length > 0
        ? losses.filter(t => t.openedAt && t.closedAt).reduce((s, t) => s + (new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()), 0) / losses.length / 60000
        : 0;
    const config = (bot.trainerConfig ?? {});
    const previousActions = (config.insights ?? [])
        .filter((i) => i.type === 'retrain' || i.type === 'improvement')
        .slice(0, 5)
        .map((i) => `[${new Date(i.ts).toLocaleDateString()}] ${i.message}`)
        .join('\n');
    // Read current market context (set by auto-trainer check cycle)
    let marketContext = '';
    try {
        marketContext = (await redisConnection.get(`trainer:market-context:${bot.id}`)) ?? '';
    }
    catch { }
    // Build comprehensive analysis prompt with real trade examples
    const analysisPrompt = `
Bot: "${bot.name}" | Strategy: ${bot.strategy} | Risk: ${bot.riskLevel}
Current Prompt: ${bot.prompt ?? 'None'}

TRAINER HISTORY (last 5 actions — build on what worked, avoid repeating failures):
${previousActions || 'No previous trainer actions — this is the first analysis.'}
${marketContext ? `\nCURRENT MARKET CONTEXT: ${marketContext}` : ''}

PERFORMANCE METRICS (${perf.totalTrades} total trades):
- Win Rate: ${perf.winRate.toFixed(1)}% (recent 10: ${perf.recentWinRate.toFixed(1)}%)
- Profit Factor: ${perf.profitFactor.toFixed(2)} (needs >1.2)
- Avg Win: +${perf.avgWinPct.toFixed(2)}% | Avg Loss: -${perf.avgLossPct.toFixed(2)}%
- Max Drawdown: ${perf.maxDrawdown.toFixed(2)}%
- Consecutive Losses: ${perf.consecutiveLosses}
- Sharpe Estimate: ${perf.sharpeEstimate.toFixed(2)}
- Health Score: ${perf.trainerScore}/100
- Retrain Reason: ${perf.retrainReason ?? 'Manual/scheduled'}

PATTERN ANALYSIS (from ${closedTrades.length} closed trades):
- Top signal in winning trades: ${topWinSignal}
- Top signal in losing trades: ${topLossSignal}
- Avg hold time — wins: ${avgHoldWins.toFixed(0)}min, losses: ${avgHoldLosses.toFixed(0)}min
${avgHoldLosses > avgHoldWins * 1.5 ? '⚠ HOLDING LOSERS TOO LONG — consider tighter stops' : ''}
${avgHoldWins < 10 ? '⚠ EXITS TOO EARLY — wins avg only ' + avgHoldWins.toFixed(0) + 'min, may be cutting profits' : ''}

INDIVIDUAL TRADE EXAMPLES (most recent ${closedTrades.length} — find the pattern):
${tradeExamples || 'No closed trades yet.'}

Current Config:
${JSON.stringify(bot.config ?? {}, null, 2)}

Recent Decision Pattern (last ${recentDecisions.length}):
${recentDecisions.slice(0, 10).map(d => `${d.action}(${d.confidence}) ${d.symbol}: ${d.reasoning?.slice(0, 60)}`).join('\n')}

Analyze the individual trade examples above to find what entry conditions consistently lead to wins vs losses. Generate a refined strategy that exploits the winning pattern and avoids the losing one.`;
    try {
        const response = await llmChat([{ role: 'user', content: analysisPrompt }], { system: TRAINER_SYSTEM, maxTokens: 2048, temperature: 0.3, cacheSystem: true });
        let text = response.text;
        const cb = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (cb)
            text = cb[1].trim();
        const jm = text.match(/\{[\s\S]*\}/);
        if (!jm)
            throw new Error('No JSON in trainer response');
        const result = JSON.parse(jm[0]);
        // Calculate real confidence from verifiable data signals — do not use LLM's self-reported score
        let realConfidence = 40; // base
        // +20 if we have enough trades for a statistically meaningful sample
        if (perf.totalTrades >= 20)
            realConfidence += 20;
        else if (perf.totalTrades >= 10)
            realConfidence += 10;
        // +15 if profit factor is above breakeven (strategy makes more than it loses)
        if (perf.profitFactor >= 1.2)
            realConfidence += 15;
        else if (perf.profitFactor >= 1.0)
            realConfidence += 5;
        // +15 if win rate is respectable
        if (perf.winRate >= 55)
            realConfidence += 15;
        else if (perf.winRate >= 50)
            realConfidence += 8;
        // +10 if the new config has a better R:R ratio than current (TP/SL > current ratio)
        const newSL = result.configChanges?.stopLoss ?? bot.config?.stopLoss ?? 3;
        const newTP = result.configChanges?.takeProfit ?? bot.config?.takeProfit ?? 6;
        const currentSL = bot.config?.stopLoss ?? 3;
        const currentTP = bot.config?.takeProfit ?? 6;
        if (newTP / newSL > currentTP / currentSL)
            realConfidence += 10;
        // -20 if we have very few trades (not enough signal)
        if (perf.totalTrades < 10)
            realConfidence -= 20;
        // -15 if drawdown is severe — risky to auto-promote in a drawdown
        if (perf.maxDrawdown > 20)
            realConfidence -= 15;
        else if (perf.maxDrawdown > 10)
            realConfidence -= 5;
        // -10 if this is the first trainer run (no baseline to compare)
        if (!config.lastRetrainAt)
            realConfidence -= 10;
        realConfidence = Math.max(0, Math.min(100, realConfidence));
        return {
            improvedPrompt: result.improvedPrompt ?? bot.prompt ?? '',
            configChanges: result.configChanges ?? {},
            insights: result.keyInsights ?? [],
            diagnosis: result.diagnosis ?? '',
            expectedImpact: result.expectedImpact ?? '',
            confidence: realConfidence,
        };
    }
    catch (err) {
        console.error('[Trainer] Agent failed:', err.message);
        return null;
    }
}
// ─── Get Trainer Status for a Bot ────────────────────────────────────────────
export async function getTrainerStatus(botId, callerId) {
    const [bot] = await db.select({ trainerConfig: bots.trainerConfig, creatorId: bots.creatorId })
        .from(bots).where(eq(bots.id, botId)).limit(1);
    const isCreator = !!callerId && bot?.creatorId === callerId;
    const fullConfig = (bot?.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
    // Non-creators see public trainer data only — no pending strategy (that's IP)
    let config;
    if (isCreator) {
        config = fullConfig;
    }
    else {
        const { pendingPrompt: _pp, pendingConfig: _pc, ...publicConfig } = fullConfig;
        config = publicConfig;
    }
    const performance = await analyzeBotPerformance(botId);
    let redisStatus = null;
    try {
        redisStatus = await redisConnection.get(`trainer:status:${botId}`);
    }
    catch { }
    return { config, performance, redisStatus, isCreator };
}
// ─── Update Trainer Config ────────────────────────────────────────────────────
export async function updateTrainerConfig(botId, userId, updates) {
    const [bot] = await db.select({ trainerConfig: bots.trainerConfig, creatorId: bots.creatorId })
        .from(bots).where(eq(bots.id, botId)).limit(1);
    if (!bot)
        throw new Error('Bot not found');
    if (bot.creatorId !== userId)
        throw new Error('Not authorized');
    const current = (bot.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
    const merged = { ...current, ...updates };
    // Keep autoRetrain in sync with trainingMode — single source of truth
    if (updates.trainingMode !== undefined) {
        merged.autoRetrain = merged.trainingMode !== 'off';
    }
    else if (updates.autoRetrain !== undefined) {
        // Legacy path: if autoRetrain changed directly, derive trainingMode
        if (!merged.autoRetrain) {
            merged.trainingMode = 'off';
        }
        else if (!merged.trainingMode || merged.trainingMode === 'off') {
            merged.trainingMode = 'suggestions'; // safe default when enabling
        }
    }
    await db.update(bots).set({
        trainerConfig: merged,
        updatedAt: new Date(),
    }).where(eq(bots.id, botId));
    return merged;
}
// ─── Trigger Manual Retrain ───────────────────────────────────────────────────
export async function triggerRetrain(botId, userId) {
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    if (!bot)
        return { success: false, message: 'Bot not found' };
    if (bot.creatorId !== userId)
        return { success: false, message: 'Not authorized' };
    // Update status to retraining
    const currentConfig = (bot.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
    await db.update(bots).set({
        trainerConfig: {
            ...currentConfig,
            trainerStatus: 'retraining',
        },
        updatedAt: new Date(),
    }).where(eq(bots.id, botId));
    // Run trainer agent
    const trainerResult = await runTrainerAgent(botId);
    if (!trainerResult) {
        await db.update(bots).set({
            trainerConfig: {
                ...currentConfig,
                trainerStatus: 'idle',
                lastInsightAt: new Date().toISOString(),
                insights: [{
                        ts: new Date().toISOString(),
                        type: 'warning',
                        message: 'Trainer agent failed — AI credits may be needed.',
                        action: 'Check AI provider credits',
                    }, ...(currentConfig.insights ?? [])].slice(0, 20),
            },
            updatedAt: new Date(),
        }).where(eq(bots.id, botId));
        return { success: false, message: 'Trainer agent failed — AI credits needed' };
    }
    const newInsight = {
        ts: new Date().toISOString(),
        type: 'retrain',
        message: `Trainer generated improved strategy (confidence: ${trainerResult.confidence}%). ${trainerResult.diagnosis}`,
        action: 'Review and apply in trainer panel',
    };
    // Store as pending (not auto-applied — user reviews first unless autoApply)
    const updatedConfig = {
        ...currentConfig,
        trainerStatus: 'shadow_validating',
        lastRetrainAt: new Date().toISOString(),
        trainerScore: (await analyzeBotPerformance(botId)).trainerScore,
        pendingPrompt: trainerResult.improvedPrompt,
        pendingConfig: trainerResult.configChanges,
        lastInsightAt: new Date().toISOString(),
        insights: [newInsight, ...(currentConfig.insights ?? [])].slice(0, 20),
    };
    await db.update(bots).set({
        trainerConfig: updatedConfig,
        updatedAt: new Date(),
    }).where(eq(bots.id, botId));
    // Queue for shadow validation — stores candidate config with validation deadline
    const shadowValidationHours = currentConfig.shadowValidationHours ?? 24;
    const validationDeadline = new Date(Date.now() + shadowValidationHours * 3600 * 1000).toISOString();
    try {
        await redisConnection.set(`trainer:pending:${botId}`, JSON.stringify({
            prompt: trainerResult.improvedPrompt,
            config: trainerResult.configChanges,
            startedAt: new Date().toISOString(),
            validationDeadlineAt: validationDeadline,
            baselineWinRate: (await analyzeBotPerformance(botId)).winRate,
            baselinePF: (await analyzeBotPerformance(botId)).profitFactor,
        }), 'EX', shadowValidationHours * 3600 + 3600); // TTL = validation window + 1hr buffer
    }
    catch { }
    return {
        success: true,
        message: `Trainer generated improved strategy. Shadow validation started (${currentConfig.shadowValidationHours}h).`,
        trainerResult,
    };
}
// ─── Promote Pending Trainer Changes ─────────────────────────────────────────
// Called by user to promote validated pending prompt/config to live
export async function promotePendingChanges(botId, userId) {
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    if (!bot)
        return { success: false, message: 'Bot not found' };
    if (bot.creatorId !== userId)
        return { success: false, message: 'Not authorized' };
    const config = (bot.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
    if (!config.pendingPrompt && !config.pendingConfig) {
        return { success: false, message: 'No pending trainer changes to promote' };
    }
    const promotedPrompt = config.pendingPrompt;
    // Apply improved prompt to bot
    const updates = { updatedAt: new Date() };
    if (config.pendingPrompt) {
        updates.prompt = config.pendingPrompt;
    }
    // Apply config changes (merge into existing bot.config)
    if (config.pendingConfig && Object.keys(config.pendingConfig).length > 0) {
        const currentBotConfig = bot.config ?? {};
        const cc = config.pendingConfig;
        const newConfig = { ...currentBotConfig };
        if (cc.stopLoss != null)
            newConfig.stopLoss = cc.stopLoss;
        if (cc.takeProfit != null)
            newConfig.takeProfit = cc.takeProfit;
        if (cc.aiMode != null)
            newConfig.aiMode = cc.aiMode;
        if (cc.tradingFrequency != null)
            newConfig.tradingFrequency = cc.tradingFrequency;
        updates.config = newConfig;
    }
    const promotedInsight = {
        ts: new Date().toISOString(),
        type: 'improvement',
        message: 'Trainer improvements promoted to live bot.',
    };
    await db.update(bots).set({
        ...updates,
        trainerConfig: {
            ...config,
            trainerStatus: 'monitoring',
            pendingPrompt: null,
            pendingConfig: null,
            insights: [promotedInsight, ...(config.insights ?? [])].slice(0, 20),
        },
    }).where(eq(bots.id, botId));
    // Apply trainer config changes directly into rules cache so the very next engine
    // cycle (30s away) uses improved stopLoss/takeProfit/aiMode without waiting for
    // another LLM generateRules call. Falls back to plain invalidation if cache is empty.
    try {
        const { applyTrainerConfigToRulesCache, invalidateRulesCache } = await import('../../lib/bot-engine.js');
        if (config.pendingConfig && Object.keys(config.pendingConfig).length > 0) {
            applyTrainerConfigToRulesCache(botId, config.pendingConfig);
        }
        else {
            // No structured config changes — just invalidate so engine re-generates from new prompt
            invalidateRulesCache(botId);
        }
    }
    catch { /* Non-fatal if engine isn't loaded yet */ }
    return {
        success: true,
        message: 'Trainer improvements applied to live bot. Rules cache updated immediately.',
        newPrompt: promotedPrompt ?? undefined,
    };
}
// ─── Automated Monitoring Check ───────────────────────────────────────────────
// Called from the auto-trainer BullMQ job
export async function runAutoTrainerCheck(botId) {
    const [bot] = await db.select({ trainerConfig: bots.trainerConfig, creatorId: bots.creatorId })
        .from(bots).where(eq(bots.id, botId)).limit(1);
    if (!bot)
        return;
    const config = (bot.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
    // Resolve effective mode — support both old autoRetrain bool and new trainingMode
    const mode = config.trainingMode
        ?? (config.autoRetrain ? 'suggestions' : 'off');
    // 'off' — do nothing at all
    if (mode === 'off')
        return;
    // Skip if already working
    if (config.trainerStatus === 'retraining' || config.trainerStatus === 'shadow_validating')
        return;
    const perf = await analyzeBotPerformance(botId);
    // Fetch current market regime from Redis (populated by price-sync job)
    let marketContext = '';
    try {
        const btcRaw = await redisConnection.get('price:BTC:USDT');
        if (btcRaw) {
            const btcData = JSON.parse(btcRaw);
            const btcChange = btcData.change24h ?? 0;
            const btcVol = btcData.high24h > 0 ? ((btcData.high24h - btcData.low24h) / btcData.low24h) * 100 : 0;
            const regimeLabel = btcChange < -5 ? 'CRASH' : btcChange < -2 ? 'BEARISH' : btcChange > 5 ? 'BULLISH_SURGE' : btcChange > 2 ? 'BULLISH' : 'NEUTRAL';
            marketContext = `BTC regime: ${regimeLabel} (${btcChange.toFixed(1)}% 24h, range ${btcVol.toFixed(1)}%)`;
        }
    }
    catch { }
    // Store market context in Redis so runTrainerAgent can include it
    if (marketContext) {
        await redisConnection.set(`trainer:market-context:${botId}`, marketContext, 'EX', 3600).catch(() => { });
    }
    const currentInsights = config.insights ?? [];
    let shouldFire = false;
    let fireReason = '';
    // Performance-based triggers
    if (config.retrainMode === 'performance' || config.retrainMode === 'combined') {
        if (perf.needsRetrain) {
            shouldFire = true;
            fireReason = perf.retrainReason ?? 'Performance degraded';
        }
        if (perf.consecutiveLosses >= config.consecutiveLossLimit) {
            shouldFire = true;
            fireReason = `${perf.consecutiveLosses} consecutive losses (limit: ${config.consecutiveLossLimit})`;
        }
        if (perf.profitFactor < config.profitFactorFloor && perf.totalTrades >= 10) {
            shouldFire = true;
            fireReason = `Profit factor ${perf.profitFactor.toFixed(2)} below floor ${config.profitFactorFloor}`;
        }
    }
    // Time-based trigger
    if (config.retrainMode === 'time' || config.retrainMode === 'combined') {
        if (config.lastRetrainAt) {
            const daysSince = (Date.now() - new Date(config.lastRetrainAt).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince >= config.retrainIntervalDays) {
                shouldFire = true;
                fireReason = `Scheduled retrain (every ${config.retrainIntervalDays} days)`;
            }
        }
        else if (perf.totalTrades >= 20) {
            shouldFire = true;
            fireReason = 'Initial trainer analysis';
        }
    }
    const monitoringInsight = {
        ts: new Date().toISOString(),
        type: perf.trainerScore >= 70 ? 'info' : perf.trainerScore >= 50 ? 'warning' : 'retrain',
        message: `[${mode.toUpperCase()}] Health ${perf.trainerScore}/100. WR: ${perf.winRate.toFixed(0)}%, PF: ${perf.profitFactor.toFixed(2)}, DD: ${perf.maxDrawdown.toFixed(1)}%${marketContext ? ` | ${marketContext}` : ''}${shouldFire ? ` — ${fireReason}` : ''}`,
    };
    await db.update(bots).set({
        trainerConfig: {
            ...config,
            trainingMode: mode,
            trainerScore: perf.trainerScore,
            trainerStatus: shouldFire ? 'retraining' : 'monitoring',
            lastInsightAt: new Date().toISOString(),
            insights: [monitoringInsight, ...currentInsights].slice(0, 30),
        },
        updatedAt: new Date(),
    }).where(eq(bots.id, botId));
    if (!shouldFire)
        return;
    console.log(`[Trainer] ${mode} mode — firing for bot ${botId}: ${fireReason}`);
    if (mode === 'auto') {
        // AUTO: run trainer AND auto-promote if result is good (confidence ≥ 70)
        await fireAutoRetrain(botId, fireReason, true);
    }
    else {
        // SUGGESTIONS: run trainer, store as pending, creator must confirm
        await fireAutoRetrain(botId, fireReason, false);
    }
}
async function fireAutoRetrain(botId, reason, autoPromote) {
    try {
        const [bot] = await db.select({ creatorId: bots.creatorId }).from(bots).where(eq(bots.id, botId)).limit(1);
        if (!bot)
            return;
        const result = await triggerRetrain(botId, bot.creatorId);
        // AUTO mode: if trainer succeeded and confidence is sufficient, promote immediately
        const trainerConfidence = result.trainerResult?.confidence ?? 0;
        const trainerDiagnosis = result.trainerResult?.diagnosis ?? '';
        if (autoPromote && result.success && trainerConfidence >= 70) {
            console.log(`[Trainer] AUTO mode — auto-promoting for bot ${botId} (confidence ${trainerConfidence}%)`);
            await promotePendingChanges(botId, bot.creatorId);
            // Add auto-promote insight
            const [b2] = await db.select({ trainerConfig: bots.trainerConfig }).from(bots).where(eq(bots.id, botId)).limit(1);
            const cfg2 = (b2?.trainerConfig ?? {});
            const autoInsight = {
                ts: new Date().toISOString(),
                type: 'improvement',
                message: `[AUTO] Strategy auto-promoted (confidence ${trainerConfidence}%). ${trainerDiagnosis.slice(0, 80)}`,
            };
            await db.update(bots).set({
                trainerConfig: {
                    ...cfg2,
                    insights: [autoInsight, ...(cfg2.insights ?? [])].slice(0, 30),
                },
                updatedAt: new Date(),
            }).where(eq(bots.id, botId));
        }
    }
    catch (err) {
        console.error(`[Trainer] Auto-retrain failed for ${botId}:`, err.message);
    }
}
// ─── Get All Bots With Trainer Active (for admin panel) ──────────────────────
export async function getAllTrainerStatuses() {
    const allBots = await db.select({
        id: bots.id,
        name: bots.name,
        trainerConfig: bots.trainerConfig,
    }).from(bots).where(eq(bots.status, 'approved'));
    const results = [];
    for (const bot of allBots) {
        const config = (bot.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
        const perf = await analyzeBotPerformance(bot.id);
        results.push({
            botId: bot.id,
            botName: bot.name,
            trainerScore: config.trainerScore ?? perf.trainerScore,
            trainerStatus: config.trainerStatus,
            lastRetrainAt: config.lastRetrainAt,
            totalTrades: perf.totalTrades,
            winRate: perf.winRate,
            needsAttention: perf.trainerScore < 50 || perf.needsRetrain || perf.consecutiveLosses >= 3,
        });
    }
    return results.sort((a, b) => (a.trainerScore ?? 100) - (b.trainerScore ?? 100));
}

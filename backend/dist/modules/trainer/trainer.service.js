/**
 * Intelligent Trainer Agent Service
 *
 * A proper agentic AI trainer with:
 * - Full trade history fed via chunked RAG-style passes (no 30-trade limit)
 * - Planning loop: observe → diagnose → decide → act
 * - Adaptive decisions: knows when to change vs when to leave alone
 * - Live market context (price, regime, volatility)
 * - Dynamic SL/TP trailing when bot is profitable
 * - Human-readable timestamped insight logs
 * - Trainer memory: remembers past decisions + outcomes
 * - Retry/loop until confident or exhausted
 */
import { db } from '../../config/database.js';
import { redisConnection } from '../../config/queue.js';
import { llmChat } from '../../config/ai.js';
import { bots } from '../../db/schema/bots.js';
import { botPositions } from '../../db/schema/positions.js';
import { botDecisions } from '../../db/schema/decisions.js';
import { eq, and, desc } from 'drizzle-orm';
export const DEFAULT_TRAINER_CONFIG = {
    trainingMode: 'off',
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
    trainerMemory: [],
};
// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDateTime(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function extractJSON(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const clean = fenced ? fenced[1].trim() : text.trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match)
        return null;
    try {
        return JSON.parse(match[0]);
    }
    catch {
        let depth = 0, start = match[0].indexOf('{');
        for (let i = start; i < match[0].length; i++) {
            if (match[0][i] === '{')
                depth++;
            else if (match[0][i] === '}') {
                depth--;
                if (depth === 0) {
                    try {
                        return JSON.parse(match[0].slice(start, i + 1));
                    }
                    catch {
                        continue;
                    }
                }
            }
        }
        return null;
    }
}
// ─── Performance Analysis ─────────────────────────────────────────────────────
export async function analyzeBotPerformance(botId) {
    const allClosed = await db.select()
        .from(botPositions)
        .where(and(eq(botPositions.botId, botId), eq(botPositions.status, 'closed'), eq(botPositions.isPaper, false)))
        .orderBy(desc(botPositions.closedAt))
        .limit(500);
    const totalTrades = allClosed.length;
    if (totalTrades === 0) {
        return {
            botId, totalTrades: 0, wins: 0, losses: 0, winRate: 0, profitFactor: 0,
            avgWinPct: 0, avgLossPct: 0, maxDrawdown: 0, consecutiveLosses: 0,
            recentWinRate: 0, sharpeEstimate: 0, trainerScore: 50,
            needsRetrain: false, retrainReason: null,
            trendDirection: 'stable', recentPnlTrend: 0, profitStreak: 0,
        };
    }
    const wins = allClosed.filter(p => parseFloat(p.pnl ?? '0') > 0);
    const losses = allClosed.filter(p => parseFloat(p.pnl ?? '0') <= 0);
    const winRate = (wins.length / totalTrades) * 100;
    const grossProfit = wins.reduce((s, p) => s + parseFloat(p.pnl ?? '0'), 0);
    const grossLoss = Math.abs(losses.reduce((s, p) => s + parseFloat(p.pnl ?? '0'), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0);
    const avgWinPct = wins.length > 0
        ? wins.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / wins.length : 0;
    const avgLossPct = losses.length > 0
        ? Math.abs(losses.reduce((s, p) => s + parseFloat(p.pnlPercent ?? '0'), 0) / losses.length) : 0;
    let peak = 0, maxDrawdown = 0, cum = 0;
    for (const p of [...allClosed].reverse()) {
        cum += parseFloat(p.pnlPercent ?? '0');
        if (cum > peak)
            peak = cum;
        if (peak - cum > maxDrawdown)
            maxDrawdown = peak - cum;
    }
    let consecutiveLosses = 0;
    for (const p of allClosed) {
        if (parseFloat(p.pnl ?? '0') <= 0)
            consecutiveLosses++;
        else
            break;
    }
    let profitStreak = 0;
    for (const p of allClosed) {
        if (parseFloat(p.pnl ?? '0') > 0)
            profitStreak++;
        else
            break;
    }
    const recent10 = allClosed.slice(0, 10);
    const recentWins = recent10.filter(p => parseFloat(p.pnl ?? '0') > 0).length;
    const recentWinRate = recent10.length > 0 ? (recentWins / recent10.length) * 100 : 0;
    const returns = allClosed.map(p => parseFloat(p.pnlPercent ?? '0'));
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeEstimate = stdDev > 0 ? mean / stdDev : 0;
    // Trend: compare recent 10 vs prior 10
    const recent5 = allClosed.slice(0, 5).map(p => parseFloat(p.pnlPercent ?? '0'));
    const recentPnlTrend = recent5.length > 0 ? recent5.reduce((s, r) => s + r, 0) / recent5.length : 0;
    const prior10WR = allClosed.length >= 20
        ? (allClosed.slice(10, 20).filter(p => parseFloat(p.pnl ?? '0') > 0).length / 10) * 100 : winRate;
    const trendDirection = recentWinRate > prior10WR + 5 ? 'improving' :
        recentWinRate < prior10WR - 5 ? 'declining' : 'stable';
    let score = 50;
    score += Math.min(30, Math.max(-20, (profitFactor - 1) * 15));
    score += Math.min(25, Math.max(-15, (winRate - 50) * 0.5));
    score -= Math.min(20, consecutiveLosses * 4);
    score -= Math.min(20, maxDrawdown * 0.5);
    score += Math.min(15, Math.max(-10, sharpeEstimate * 8));
    if (trendDirection === 'improving')
        score += 5;
    if (trendDirection === 'declining')
        score -= 8;
    score = Math.max(0, Math.min(100, Math.round(score)));
    let needsRetrain = false;
    let retrainReason = null;
    if (profitFactor < 1.2 && totalTrades >= 10) {
        needsRetrain = true;
        retrainReason = `Profit factor ${profitFactor.toFixed(2)} below 1.2`;
    }
    else if (consecutiveLosses >= 5) {
        needsRetrain = true;
        retrainReason = `${consecutiveLosses} consecutive losses`;
    }
    else if (recentWinRate < winRate - 15 && totalTrades >= 20) {
        needsRetrain = true;
        retrainReason = `Recent WR ${recentWinRate.toFixed(0)}% dropped >15pts from overall ${winRate.toFixed(0)}%`;
    }
    return {
        botId, totalTrades, wins: wins.length, losses: losses.length, winRate, profitFactor,
        avgWinPct, avgLossPct, maxDrawdown, consecutiveLosses, recentWinRate, sharpeEstimate,
        trainerScore: score, needsRetrain, retrainReason,
        trendDirection, recentPnlTrend, profitStreak,
    };
}
// ─── Live Market Context ──────────────────────────────────────────────────────
async function getLiveMarketContext() {
    try {
        const [btcRaw, ethRaw] = await Promise.all([
            redisConnection.get('price:BTC:USDT').catch(() => null),
            redisConnection.get('price:ETH:USDT').catch(() => null),
        ]);
        const parts = [];
        if (btcRaw) {
            const b = JSON.parse(btcRaw);
            const chg = b.change24h ?? 0;
            const range = b.high24h > 0 ? ((b.high24h - b.low24h) / b.low24h * 100) : 0;
            const regime = chg < -5 ? 'CRASH' : chg < -2 ? 'BEARISH' : chg > 5 ? 'BULLISH_SURGE' : chg > 2 ? 'BULLISH' : 'NEUTRAL';
            parts.push(`BTC: $${b.price?.toFixed(0) ?? '?'} (${chg >= 0 ? '+' : ''}${chg.toFixed(1)}% 24h, range ${range.toFixed(1)}%, regime: ${regime})`);
        }
        if (ethRaw) {
            const e = JSON.parse(ethRaw);
            const chg = e.change24h ?? 0;
            parts.push(`ETH: $${e.price?.toFixed(0) ?? '?'} (${chg >= 0 ? '+' : ''}${chg.toFixed(1)}% 24h)`);
        }
        return parts.join(' | ') || 'Market data unavailable';
    }
    catch {
        return 'Market data unavailable';
    }
}
async function buildTradeChunks(botId) {
    // Load ALL closed trades — no artificial limit
    const allTrades = await db.select({
        pnl: botPositions.pnl,
        pnlPercent: botPositions.pnlPercent,
        entryReasoning: botPositions.entryReasoning,
        exitReasoning: botPositions.exitReasoning,
        symbol: botPositions.symbol,
        openedAt: botPositions.openedAt,
        closedAt: botPositions.closedAt,
    }).from(botPositions)
        .where(and(eq(botPositions.botId, botId), eq(botPositions.status, 'closed')))
        .orderBy(desc(botPositions.closedAt));
    const total = allTrades.length;
    if (total === 0)
        return { chunks: [], totalTrades: 0, allTradesSummary: 'No closed trades yet.' };
    const INDICATORS = ['rsi', 'ema', 'macd', 'bollinger', 'momentum', 'trend', 'support', 'resistance', 'volume', 'breakout', 'oversold', 'overbought'];
    function analyzeChunk(trades, label) {
        const wins = trades.filter(t => parseFloat(t.pnl ?? '0') > 0);
        const losses = trades.filter(t => parseFloat(t.pnl ?? '0') <= 0);
        const wp = {}, lp = {};
        for (const t of wins)
            for (const ind of INDICATORS) {
                if (t.entryReasoning?.toLowerCase().includes(ind))
                    wp[ind] = (wp[ind] ?? 0) + 1;
            }
        for (const t of losses)
            for (const ind of INDICATORS) {
                if (t.entryReasoning?.toLowerCase().includes(ind))
                    lp[ind] = (lp[ind] ?? 0) + 1;
            }
        const topWin = Object.entries(wp).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
        const topLoss = Object.entries(lp).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
        const avgWP = wins.length > 0 ? wins.reduce((s, t) => s + parseFloat(t.pnlPercent ?? '0'), 0) / wins.length : 0;
        const avgLP = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + parseFloat(t.pnlPercent ?? '0'), 0) / losses.length) : 0;
        const holdW = wins.filter(t => t.openedAt && t.closedAt).reduce((s, t) => s + (new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()), 0);
        const holdL = losses.filter(t => t.openedAt && t.closedAt).reduce((s, t) => s + (new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()), 0);
        // Show only the 6 most representative trades (3 wins + 3 losses)
        const topWins = wins.slice(0, 3).map(t => {
            const pnl = parseFloat(t.pnlPercent ?? '0');
            const held = t.openedAt && t.closedAt ? Math.round((new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()) / 60000) : 0;
            return `  WIN +${pnl.toFixed(2)}% [${held}min] ${t.symbol}: ${t.entryReasoning?.slice(0, 70) ?? '?'}`;
        });
        const topLosses = losses.slice(0, 3).map(t => {
            const pnl = parseFloat(t.pnlPercent ?? '0');
            const held = t.openedAt && t.closedAt ? Math.round((new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()) / 60000) : 0;
            return `  LOSS ${pnl.toFixed(2)}% [${held}min] ${t.symbol}: ${t.entryReasoning?.slice(0, 70) ?? '?'}`;
        });
        return {
            chunkLabel: label,
            totalInChunk: trades.length,
            winsInChunk: wins.length,
            topWinSignal: topWin,
            topLossSignal: topLoss,
            avgWinPct: avgWP,
            avgLossPct: avgLP,
            avgHoldWinsMin: wins.length > 0 ? holdW / wins.length / 60000 : 0,
            avgHoldLossesMin: losses.length > 0 ? holdL / losses.length / 60000 : 0,
            examples: [...topWins, ...topLosses].join('\n'),
        };
    }
    // Chunk 1: most recent 15 (what the bot is doing NOW)
    // Chunk 2: trades 16-40 (recent history)
    // Chunk 3: everything older (long-term baseline)
    const chunks = [];
    if (total > 0)
        chunks.push(analyzeChunk(allTrades.slice(0, Math.min(15, total)), `Most recent ${Math.min(15, total)} trades (current behaviour)`));
    if (total > 15)
        chunks.push(analyzeChunk(allTrades.slice(15, Math.min(40, total)), `Trades 16–${Math.min(40, total)} (recent history)`));
    if (total > 40)
        chunks.push(analyzeChunk(allTrades.slice(40), `Trades 41–${total} (long-term baseline)`));
    // Overall one-line summary per chunk
    const allTradesSummary = chunks.map(c => {
        const wr = c.totalInChunk > 0 ? (c.winsInChunk / c.totalInChunk * 100).toFixed(0) : '0';
        return `${c.chunkLabel}: ${c.winsInChunk}W/${c.totalInChunk - c.winsInChunk}L (${wr}% WR) | top-win-signal: ${c.topWinSignal}, top-loss-signal: ${c.topLossSignal} | avg hold: wins ${c.avgHoldWinsMin.toFixed(0)}min / losses ${c.avgHoldLossesMin.toFixed(0)}min`;
    }).join('\n');
    return { chunks, totalTrades: total, allTradesSummary };
}
// ─── Trainer Memory String ────────────────────────────────────────────────────
function buildMemoryContext(memory) {
    if (!memory || memory.length === 0)
        return 'No prior trainer cycles — this is the first analysis.';
    return memory.slice(0, 8).map(m => {
        const outcome = m.outcome ? ` → OUTCOME: ${m.outcome.toUpperCase()}` : ' → outcome: still measuring';
        return `[Cycle ${m.cycleNumber} @ ${m.ts.slice(0, 10)}] Decision: ${m.decision.toUpperCase()} | ${m.diagnosis.slice(0, 100)} | Changes: ${m.changesSummary}${outcome}`;
    }).join('\n');
}
// ─── Agentic Trainer System Prompt ───────────────────────────────────────────
const TRAINER_SYSTEM = `You are an intelligent, agentic trading bot trainer with memory and planning capabilities.

You analyze a trading bot's COMPLETE history and make ONE of four decisions:
1. CHANGED — the strategy needs significant changes (new prompt + config tweaks)
2. ADJUSTED — small config tweaks only (SL/TP/frequency), prompt stays the same
3. KEPT — strategy is working or recently changed, do NOT touch it
4. SKIPPED — not enough data yet to make a reliable decision

CRITICAL RULES:
- If the bot is currently profitable (trend=improving, recent WR going up) — lean towards KEPT or ADJUSTED only
- If a change was made last cycle and performance improved — do NOT change again, let it run
- If a change was made last cycle and performance declined — diagnose WHY and fix it
- Dynamic SL/TP: if bot is on a profit streak (3+ wins), suggest tighter TP to lock in gains
- Dynamic SL/TP: if bot has 3+ consecutive losses, tighten SL to limit damage
- Do NOT keep making the same diagnosis repeatedly if prior changes had no effect
- Read the TRAINER MEMORY carefully — do not repeat mistakes from prior cycles

CRITICAL: Respond with a single valid JSON object only. No markdown, no preamble. Start with { end with }.
{
  "decision": "changed|adjusted|kept|skipped",
  "reasoning": "plain English explanation of WHY you made this decision (2-3 sentences, specific)",
  "diagnosis": "what is working vs not working, referencing actual trade data",
  "improvedPrompt": "full new prompt string, or null if decision is kept/skipped",
  "configChanges": {
    "stopLoss": number_or_null,
    "takeProfit": number_or_null,
    "aiMode": "rules_only|hybrid|full_ai" or null,
    "tradingFrequency": "conservative|balanced|aggressive" or null,
    "aiConfidenceThreshold": number_or_null
  },
  "keyInsights": ["specific observation 1", "specific observation 2", "specific observation 3"],
  "expectedImpact": "what you expect to happen after this decision and why",
  "changesSummary": "one-line summary of what changed, e.g. 'SL 3%→2%, TP 6%→5%, added RSI filter'",
  "confidence": 0-100
}`;
// ─── Core Agentic Trainer Agent ───────────────────────────────────────────────
export async function runTrainerAgent(botId) {
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    if (!bot)
        return null;
    const perf = await analyzeBotPerformance(botId);
    const marketContext = await getLiveMarketContext();
    const { chunks, totalTrades, allTradesSummary } = await buildTradeChunks(botId);
    const trainerConfig = (bot.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
    const memory = trainerConfig.trainerMemory ?? [];
    const cycleNumber = memory.length + 1;
    // Recent decisions context
    const recentDecisions = await db.select({
        action: botDecisions.action,
        reasoning: botDecisions.reasoning,
        symbol: botDecisions.symbol,
        confidence: botDecisions.confidence,
        createdAt: botDecisions.createdAt,
    }).from(botDecisions)
        .where(eq(botDecisions.botId, botId))
        .orderBy(desc(botDecisions.createdAt))
        .limit(20);
    // Fetch post-trade notes written by the agentic monitor (EXIT_EARLY, SL hits, TP hits, wins/losses)
    let postTradeNotes = '';
    try {
        const notes = await redisConnection.lrange(`bot:posttrade:${botId}`, 0, 7);
        if (notes && notes.length > 0)
            postTradeNotes = notes.join('\n  ');
    }
    catch { }
    // Build full chunk details for prompt
    const chunkDetails = chunks.map(c => `
=== ${c.chunkLabel} ===
Win rate: ${c.totalInChunk > 0 ? (c.winsInChunk / c.totalInChunk * 100).toFixed(0) : 0}% (${c.winsInChunk}W / ${c.totalInChunk - c.winsInChunk}L)
Top winning signal: ${c.topWinSignal} | Top losing signal: ${c.topLossSignal}
Avg win: +${c.avgWinPct.toFixed(2)}% held ${c.avgHoldWinsMin.toFixed(0)}min | Avg loss: -${c.avgLossPct.toFixed(2)}% held ${c.avgHoldLossesMin.toFixed(0)}min
${c.avgHoldLossesMin > c.avgHoldWinsMin * 1.5 ? '⚠ HOLDING LOSERS LONGER THAN WINNERS — tighten SL' : ''}
${c.avgHoldWinsMin < 8 ? '⚠ EXITING WINNERS TOO EARLY — widen TP or trail stop' : ''}
Representative trades:
${c.examples || '  (no examples)'}
`).join('\n');
    const analysisPrompt = `
BOT: "${bot.name}" | Strategy: ${bot.strategy} | Risk: ${bot.riskLevel}
Current Prompt: ${bot.prompt ?? 'None'}
Current Config: stopLoss=${bot.config?.stopLoss ?? '?'}%, takeProfit=${bot.config?.takeProfit ?? '?'}%, aiMode=${bot.config?.aiMode ?? '?'}, frequency=${bot.config?.tradingFrequency ?? '?'}

LIVE MARKET RIGHT NOW: ${marketContext}

TRAINER MEMORY (what happened in past cycles — learn from this):
${buildMemoryContext(memory)}

PERFORMANCE OVERVIEW (${totalTrades} total trades):
- Overall: WR ${perf.winRate.toFixed(1)}% | PF ${perf.profitFactor.toFixed(2)} | Sharpe ${perf.sharpeEstimate.toFixed(2)}
- Recent 10: WR ${perf.recentWinRate.toFixed(1)}% | Trend: ${perf.trendDirection.toUpperCase()}
- Avg Win: +${perf.avgWinPct.toFixed(2)}% | Avg Loss: -${perf.avgLossPct.toFixed(2)}% | R:R ratio: ${perf.avgLossPct > 0 ? (perf.avgWinPct / perf.avgLossPct).toFixed(2) : 'N/A'}
- Max Drawdown: ${perf.maxDrawdown.toFixed(2)}% | Consecutive Losses NOW: ${perf.consecutiveLosses}
- Current Profit Streak: ${perf.profitStreak} wins | Recent 5-trade PnL avg: ${perf.recentPnlTrend.toFixed(2)}%
- Health Score: ${perf.trainerScore}/100

TRADE HISTORY SUMMARY (all ${totalTrades} trades, chunked):
${allTradesSummary}

DETAILED TRADE ANALYSIS:
${chunkDetails}

RECENT BOT DECISIONS (last ${recentDecisions.length}):
${recentDecisions.slice(0, 8).map(d => `${d.action}(conf:${d.confidence}) ${d.symbol}: ${d.reasoning?.slice(0, 60)}`).join('\n')}
${postTradeNotes ? `\nAGENTIC MONITOR TRADE NOTES (how positions actually closed — EXIT_EARLY, SL hits, trailing stops):\n  ${postTradeNotes}` : ''}
TRAINER CYCLE: #${cycleNumber}
TRIGGER REASON: ${perf.retrainReason ?? 'Scheduled analysis'}

Now make your decision. Remember: if the bot is improving, say KEPT. If just small tweaks needed, say ADJUSTED. Only say CHANGED if there is a genuine structural problem in the strategy.`;
    // Agentic retry loop — try up to 3 times with increasing strictness
    let result = null;
    let lastResponse = '';
    let attemptLog = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const messages = attempt === 1
                ? [{ role: 'user', content: analysisPrompt }]
                : [
                    { role: 'user', content: analysisPrompt },
                    { role: 'assistant', content: lastResponse },
                    { role: 'user', content: `Attempt ${attempt}: Your previous response was not valid JSON or was missing required fields. Reply with ONLY a valid JSON object. Required: decision, reasoning, diagnosis, improvedPrompt, configChanges, keyInsights, expectedImpact, changesSummary, confidence.` },
                ];
            const response = await llmChat(messages, {
                system: TRAINER_SYSTEM,
                maxTokens: 8192,
                temperature: attempt === 1 ? 0.3 : 0,
                cacheSystem: true,
            });
            console.log(`[Trainer] Cycle #${cycleNumber} attempt ${attempt}: ${response.provider}/${response.model} (${response.usage?.outputTokens ?? '?'} tokens)`);
            lastResponse = response.text;
            attemptLog += `attempt${attempt}:${response.provider} `;
            result = extractJSON(response.text);
            if (result && result.decision && result.reasoning)
                break;
            result = null;
        }
        catch (err) {
            const msg = err?.message ?? String(err);
            console.warn(`[Trainer] Cycle #${cycleNumber} attempt ${attempt} failed: ${msg}`);
            if (attempt === 3) {
                console.error(`[Trainer] All attempts exhausted for bot ${botId}`);
                return null;
            }
        }
    }
    if (!result)
        return null;
    // Validate and fill defaults
    const decision = (['changed', 'adjusted', 'kept', 'skipped'].includes(result.decision)) ? result.decision : 'kept';
    if (!result.configChanges)
        result.configChanges = {};
    if (!result.keyInsights)
        result.keyInsights = [];
    if (!result.diagnosis)
        result.diagnosis = 'Analysis complete.';
    if (!result.reasoning)
        result.reasoning = 'No reasoning provided.';
    if (!result.expectedImpact)
        result.expectedImpact = 'No impact prediction.';
    if (!result.changesSummary)
        result.changesSummary = decision === 'kept' ? 'No changes made' : 'Config updated';
    // If decision is kept/skipped — clear any config changes to avoid accidental tweaks
    if (decision === 'kept' || decision === 'skipped') {
        result.configChanges = {};
        result.improvedPrompt = null;
    }
    // Dynamic SL/TP intelligence based on current state
    if (decision === 'adjusted' || decision === 'changed') {
        const currentSL = bot.config?.stopLoss ?? 3;
        const currentTP = bot.config?.takeProfit ?? 6;
        // On a 3+ win streak → tighten TP to lock in gains (trail stop logic)
        if (perf.profitStreak >= 3 && !result.configChanges.takeProfit) {
            result.configChanges.takeProfit = Math.max(currentTP * 0.85, 1.5);
            result.changesSummary += ` | TP tightened to ${result.configChanges.takeProfit.toFixed(1)}% (profit streak ${perf.profitStreak})`;
        }
        // On 3+ consecutive losses → tighten SL urgently
        if (perf.consecutiveLosses >= 3 && !result.configChanges.stopLoss) {
            result.configChanges.stopLoss = Math.max(currentSL * 0.75, 1.0);
            result.changesSummary += ` | SL tightened to ${result.configChanges.stopLoss.toFixed(1)}% (${perf.consecutiveLosses} consec losses)`;
        }
    }
    // Real confidence score (not from AI self-report)
    let realConfidence = 40;
    if (perf.totalTrades >= 30)
        realConfidence += 25;
    else if (perf.totalTrades >= 15)
        realConfidence += 15;
    else if (perf.totalTrades >= 5)
        realConfidence += 5;
    if (perf.profitFactor >= 1.3)
        realConfidence += 15;
    else if (perf.profitFactor >= 1.0)
        realConfidence += 8;
    if (perf.winRate >= 55)
        realConfidence += 15;
    else if (perf.winRate >= 45)
        realConfidence += 7;
    if (decision === 'kept')
        realConfidence += 10; // more confident when not changing
    if (decision === 'skipped')
        realConfidence = Math.min(realConfidence, 40);
    if (!trainerConfig.lastRetrainAt)
        realConfidence -= 10;
    if (perf.maxDrawdown > 20)
        realConfidence -= 15;
    if (memory.length > 0 && memory[0].outcome === 'declined')
        realConfidence -= 10;
    realConfidence = Math.max(0, Math.min(100, realConfidence));
    console.log(`[Trainer] Cycle #${cycleNumber} decision: ${decision.toUpperCase()} | confidence: ${realConfidence}% | ${attemptLog.trim()}`);
    return {
        decision,
        improvedPrompt: result.improvedPrompt ?? null,
        configChanges: result.configChanges ?? {},
        insights: result.keyInsights ?? [],
        diagnosis: result.diagnosis,
        reasoning: result.reasoning,
        expectedImpact: result.expectedImpact,
        changesSummary: result.changesSummary,
        confidence: realConfidence,
    };
}
// ─── Update Trainer Memory (called each cycle) ────────────────────────────────
async function updateTrainerMemory(botId, config, cycleResult, perf) {
    const memory = [...(config.trainerMemory ?? [])];
    // Mark previous cycle's outcome now that we have new data
    if (memory.length > 0 && memory[0].outcome === 'pending') {
        const prev = memory[0];
        const prevScore = prev.perfSnapshot.trainerScore;
        const prevWR = prev.perfSnapshot.winRate;
        memory[0] = {
            ...prev,
            outcome: perf.trainerScore > prevScore + 3 ? 'improved'
                : perf.trainerScore < prevScore - 3 ? 'declined'
                    : perf.winRate > prevWR + 2 ? 'improved'
                        : perf.winRate < prevWR - 2 ? 'declined'
                            : 'stable',
            outcomeMeasuredAt: new Date().toISOString(),
        };
    }
    // Add new cycle entry
    const newEntry = {
        ts: new Date().toISOString(),
        cycleNumber: memory.length + 1,
        decision: cycleResult.decision,
        diagnosis: cycleResult.diagnosis.slice(0, 150),
        changesSummary: cycleResult.changesSummary,
        perfSnapshot: {
            totalTrades: perf.totalTrades,
            winRate: perf.winRate,
            profitFactor: perf.profitFactor,
            trainerScore: perf.trainerScore,
            consecutiveLosses: perf.consecutiveLosses,
        },
        outcome: 'pending',
    };
    return [newEntry, ...memory].slice(0, 20); // keep last 20 cycles in memory
}
// ─── Build Human-Readable Insight Log Entry ───────────────────────────────────
function buildInsightMessage(cycleResult, perf, marketCtx, cycleNumber) {
    const now = new Date().toISOString();
    const decisionEmoji = { changed: '🔄', adjusted: '⚡', kept: '✅', skipped: '⏭' }[cycleResult.decision] ?? '•';
    let message = `[Cycle #${cycleNumber}] ${decisionEmoji} Decision: ${cycleResult.decision.toUpperCase()}\n`;
    message += `Reasoning: ${cycleResult.reasoning}\n`;
    message += `Bot health: ${perf.trainerScore}/100 | WR: ${perf.winRate.toFixed(1)}% | PF: ${perf.profitFactor.toFixed(2)} | Trend: ${perf.trendDirection}`;
    if (perf.consecutiveLosses > 0)
        message += ` | ${perf.consecutiveLosses} consec losses`;
    if (perf.profitStreak > 0)
        message += ` | ${perf.profitStreak} win streak`;
    message += `\nMarket: ${marketCtx}`;
    if (cycleResult.decision !== 'kept' && cycleResult.decision !== 'skipped') {
        message += `\nChanges: ${cycleResult.changesSummary}`;
        message += `\nExpected: ${cycleResult.expectedImpact}`;
    }
    message += `\nInsights: ${cycleResult.insights.slice(0, 3).join(' | ')}`;
    const beforeValues = {};
    const afterValues = {};
    const changedFields = [];
    for (const [k, v] of Object.entries(cycleResult.configChanges ?? {})) {
        if (v != null) {
            changedFields.push(k);
            afterValues[k] = v;
        }
    }
    return {
        ts: now,
        type: cycleResult.decision === 'kept' || cycleResult.decision === 'skipped' ? 'info'
            : cycleResult.decision === 'adjusted' ? 'improvement'
                : 'retrain',
        message,
        action: cycleResult.decision === 'changed' ? 'Review and apply in trainer panel' : undefined,
        decision: cycleResult.decision,
        changedFields,
        beforeValues,
        afterValues,
    };
}
// ─── Get Trainer Status ───────────────────────────────────────────────────────
export async function getTrainerStatus(botId, callerId) {
    const [bot] = await db.select({ trainerConfig: bots.trainerConfig, creatorId: bots.creatorId })
        .from(bots).where(eq(bots.id, botId)).limit(1);
    const isCreator = !!callerId && bot?.creatorId === callerId;
    const fullConfig = (bot?.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
    let config;
    if (isCreator) {
        config = fullConfig;
    }
    else {
        const { pendingPrompt: _pp, pendingConfig: _pc, trainerMemory: _tm, ...publicConfig } = fullConfig;
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
    if (updates.trainingMode !== undefined) {
        merged.autoRetrain = merged.trainingMode !== 'off';
    }
    else if (updates.autoRetrain !== undefined) {
        if (!merged.autoRetrain)
            merged.trainingMode = 'off';
        else if (!merged.trainingMode || merged.trainingMode === 'off')
            merged.trainingMode = 'suggestions';
    }
    await db.update(bots).set({ trainerConfig: merged, updatedAt: new Date() }).where(eq(bots.id, botId));
    return merged;
}
// ─── Trigger Retrain (manual or from auto-job) ────────────────────────────────
export async function triggerRetrain(botId, userId) {
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
    if (!bot)
        return { success: false, message: 'Bot not found' };
    if (bot.creatorId !== userId)
        return { success: false, message: 'Not authorized' };
    const currentConfig = (bot.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
    await db.update(bots).set({
        trainerConfig: { ...currentConfig, trainerStatus: 'retraining' },
        updatedAt: new Date(),
    }).where(eq(bots.id, botId));
    const perf = await analyzeBotPerformance(botId);
    const marketCtx = await getLiveMarketContext();
    const trainerResult = await runTrainerAgent(botId);
    if (!trainerResult) {
        const failInsight = {
            ts: new Date().toISOString(),
            type: 'warning',
            message: `[${fmtDateTime(new Date())}] Trainer analysis failed — all AI providers exhausted. Check API keys/credits for Anthropic, OpenAI, Gemini.`,
            action: 'Check AI provider credits',
        };
        await db.update(bots).set({
            trainerConfig: {
                ...currentConfig,
                trainerStatus: 'idle',
                lastInsightAt: new Date().toISOString(),
                insights: [failInsight, ...(currentConfig.insights ?? [])].slice(0, 30),
            },
            updatedAt: new Date(),
        }).where(eq(bots.id, botId));
        return { success: false, message: 'Trainer analysis failed — AI providers unavailable' };
    }
    // Update trainer memory
    const updatedMemory = await updateTrainerMemory(botId, currentConfig, trainerResult, perf);
    // Build human-readable insight
    const cycleNumber = updatedMemory.length;
    const insight = buildInsightMessage(trainerResult, perf, marketCtx, cycleNumber);
    const updatedConfig = {
        ...currentConfig,
        trainerStatus: trainerResult.decision === 'kept' || trainerResult.decision === 'skipped'
            ? 'monitoring' : 'shadow_validating',
        lastRetrainAt: new Date().toISOString(),
        trainerScore: perf.trainerScore,
        pendingPrompt: trainerResult.improvedPrompt,
        pendingConfig: Object.keys(trainerResult.configChanges ?? {}).length > 0
            ? { ...trainerResult.configChanges, startedAt: new Date().toISOString(), totalTradesAtDecision: perf.totalTrades } : null,
        lastInsightAt: new Date().toISOString(),
        insights: [insight, ...(currentConfig.insights ?? [])].slice(0, 30),
        trainerMemory: updatedMemory,
    };
    await db.update(bots).set({ trainerConfig: updatedConfig, updatedAt: new Date() })
        .where(eq(bots.id, botId));
    // If KEPT or SKIPPED — nothing to apply, return immediately
    if (trainerResult.decision === 'kept' || trainerResult.decision === 'skipped') {
        console.log(`[Trainer] Cycle #${cycleNumber} — ${trainerResult.decision.toUpperCase()}, no changes applied`);
        return {
            success: true,
            message: `Trainer analysed bot and decided to ${trainerResult.decision} current strategy. ${trainerResult.reasoning}`,
            trainerResult,
        };
    }
    // Store pending in Redis for shadow validation / auto-apply
    const shadowValidationHours = currentConfig.shadowValidationHours ?? 24;
    const validationDeadline = new Date(Date.now() + shadowValidationHours * 3600 * 1000).toISOString();
    try {
        await redisConnection.set(`trainer:pending:${botId}`, JSON.stringify({
            prompt: trainerResult.improvedPrompt,
            config: trainerResult.configChanges,
            startedAt: new Date().toISOString(),
            validationDeadlineAt: validationDeadline,
            baselineWinRate: perf.winRate,
            baselinePF: perf.profitFactor,
            totalTradesAtDecision: perf.totalTrades,
        }), 'EX', shadowValidationHours * 3600 + 3600);
    }
    catch { }
    return {
        success: true,
        message: `Trainer cycle #${cycleNumber}: ${trainerResult.decision.toUpperCase()} — ${trainerResult.changesSummary}`,
        trainerResult,
    };
}
// ─── Promote Pending Changes ──────────────────────────────────────────────────
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
    const updates = { updatedAt: new Date() };
    if (config.pendingPrompt)
        updates.prompt = config.pendingPrompt;
    if (config.pendingConfig && Object.keys(config.pendingConfig).length > 0) {
        const currentBotConfig = bot.config ?? {};
        const cc = config.pendingConfig;
        const newCfg = { ...currentBotConfig };
        if (cc.stopLoss != null)
            newCfg.stopLoss = cc.stopLoss;
        if (cc.takeProfit != null)
            newCfg.takeProfit = cc.takeProfit;
        if (cc.aiMode != null)
            newCfg.aiMode = cc.aiMode;
        if (cc.tradingFrequency != null)
            newCfg.tradingFrequency = cc.tradingFrequency;
        if (cc.aiConfidenceThreshold != null)
            newCfg.aiConfidenceThreshold = cc.aiConfidenceThreshold;
        updates.config = newCfg;
    }
    const promotedInsight = {
        ts: new Date().toISOString(),
        type: 'improvement',
        message: `[${fmtDateTime(new Date())}] ✅ Trainer improvements applied to live bot. New config active immediately.`,
        decision: 'changed',
    };
    await db.update(bots).set({
        ...updates,
        trainerConfig: {
            ...config,
            trainerStatus: 'monitoring',
            pendingPrompt: null,
            pendingConfig: null,
            insights: [promotedInsight, ...(config.insights ?? [])].slice(0, 30),
        },
    }).where(eq(bots.id, botId));
    try {
        const { applyTrainerConfigToRulesCache, invalidateRulesCache } = await import('../../lib/bot-engine.js');
        if (config.pendingConfig && Object.keys(config.pendingConfig).length > 0) {
            applyTrainerConfigToRulesCache(botId, config.pendingConfig);
        }
        else {
            invalidateRulesCache(botId);
        }
    }
    catch { }
    return { success: true, message: 'Trainer improvements applied to live bot. Rules cache updated immediately.', newPrompt: promotedPrompt ?? undefined };
}
// ─── Automated Check (called from job every 30 min) ───────────────────────────
export async function runAutoTrainerCheck(botId) {
    const [bot] = await db.select({ trainerConfig: bots.trainerConfig, creatorId: bots.creatorId })
        .from(bots).where(eq(bots.id, botId)).limit(1);
    if (!bot)
        return { fired: false };
    const config = (bot.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
    const mode = config.trainingMode
        ?? (config.autoRetrain ? 'suggestions' : 'off');
    if (mode === 'off')
        return { fired: false };
    // If there's already a pending improvement waiting to be applied, skip analysis
    // The apply timer in auto-trainer.job.ts handles promoting it after 30 min
    if (config.pendingPrompt || config.pendingConfig)
        return { fired: false };
    if (config.trainerStatus === 'retraining')
        return { fired: false };
    if (config.trainerStatus === 'shadow_validating')
        return { fired: false };
    const perf = await analyzeBotPerformance(botId);
    // Market context
    const marketCtx = await getLiveMarketContext();
    await redisConnection.set(`trainer:market-context:${botId}`, marketCtx, 'EX', 3600).catch(() => { });
    // ── Trigger decision ───────────────────────────────────────────────────────
    let shouldFire = false;
    let fireReason = '';
    // First time — always analyze on first cycle
    if (!config.lastRetrainAt) {
        shouldFire = true;
        fireReason = 'Initial analysis (training just enabled)';
    }
    // Time-based
    if (!shouldFire && (config.retrainMode === 'time' || config.retrainMode === 'combined')) {
        if (config.lastRetrainAt) {
            const days = (Date.now() - new Date(config.lastRetrainAt).getTime()) / 86400000;
            if (days >= config.retrainIntervalDays) {
                shouldFire = true;
                fireReason = `Scheduled (${days.toFixed(1)} days since last cycle)`;
            }
        }
    }
    // Performance-based
    if (!shouldFire && (config.retrainMode === 'performance' || config.retrainMode === 'combined')) {
        if (perf.needsRetrain) {
            shouldFire = true;
            fireReason = perf.retrainReason;
        }
        else if (perf.consecutiveLosses >= config.consecutiveLossLimit) {
            shouldFire = true;
            fireReason = `${perf.consecutiveLosses} consecutive losses`;
        }
        else if (perf.profitFactor < config.profitFactorFloor && perf.totalTrades >= 10) {
            shouldFire = true;
            fireReason = `PF ${perf.profitFactor.toFixed(2)} < floor ${config.profitFactorFloor}`;
        }
    }
    if (!shouldFire)
        return { fired: false };
    console.log(`[Trainer] ${mode.toUpperCase()} — firing cycle for bot ${botId}: ${fireReason}`);
    await db.update(bots).set({
        trainerConfig: { ...config, trainerStatus: 'retraining', trainingMode: mode, trainerScore: perf.trainerScore },
        updatedAt: new Date(),
    }).where(eq(bots.id, botId));
    try {
        const result = await triggerRetrain(botId, bot.creatorId);
        const decision = result.trainerResult?.decision ?? 'unknown';
        const note = mode === 'auto' && decision !== 'kept' && decision !== 'skipped'
            ? 'Will auto-apply in next cycle (~30 min).'
            : mode === 'suggestions' && decision !== 'kept' && decision !== 'skipped'
                ? 'Waiting for creator approval.'
                : 'No changes needed.';
        console.log(`[Trainer] ${mode.toUpperCase()} — cycle complete for bot ${botId}: ${decision.toUpperCase()}. ${note}`);
    }
    catch (err) {
        console.error(`[Trainer] Cycle failed for bot ${botId}:`, err.message);
        await db.update(bots).set({
            trainerConfig: { ...config, trainerStatus: 'monitoring' },
            updatedAt: new Date(),
        }).where(eq(bots.id, botId));
    }
    return { fired: true };
}
// ─── Admin: all trainer statuses ─────────────────────────────────────────────
export async function getAllTrainerStatuses() {
    const allBots = await db.select({ id: bots.id, name: bots.name, trainerConfig: bots.trainerConfig })
        .from(bots).where(eq(bots.status, 'approved'));
    const results = [];
    for (const bot of allBots) {
        const config = (bot.trainerConfig ?? DEFAULT_TRAINER_CONFIG);
        const perf = await analyzeBotPerformance(bot.id);
        results.push({
            botId: bot.id, botName: bot.name,
            trainerScore: config.trainerScore ?? perf.trainerScore,
            trainerStatus: config.trainerStatus,
            lastRetrainAt: config.lastRetrainAt,
            totalTrades: perf.totalTrades, winRate: perf.winRate,
            needsAttention: perf.trainerScore < 50 || perf.needsRetrain || perf.consecutiveLosses >= 3,
        });
    }
    return results.sort((a, b) => (a.trainerScore ?? 100) - (b.trainerScore ?? 100));
}

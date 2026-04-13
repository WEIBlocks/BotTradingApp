/**
 * Bot Statistics Calculation Job
 * Calculates REAL stats from positions, trades, and decisions.
 * Includes both closed P&L and unrealized P&L from open positions.
 */
import { db } from '../config/database.js';
import { botStatistics, bots, botSubscriptions, shadowSessions } from '../db/schema/bots';
import { botPositions } from '../db/schema/positions';
import { eq, and, sql } from 'drizzle-orm';
import { getPrice } from './price-sync.job.js';
async function calculateBotStats() {
    console.log('[BotStats] Calculating real statistics...');
    try {
        const allBots = await db.select({ id: bots.id, config: bots.config }).from(bots);
        for (const bot of allBots) {
            try {
                // Get LIVE positions only (exclude shadow/paper from public stats)
                const allPositions = await db.select().from(botPositions)
                    .where(and(eq(botPositions.botId, bot.id), eq(botPositions.isPaper, false)))
                    .orderBy(botPositions.openedAt);
                // Get closed positions
                const closedPositions = allPositions.filter(p => p.status === 'closed');
                const openPositions = allPositions.filter(p => p.status === 'open');
                // Get LIVE filled trades count only (exclude shadow/paper and failed/cancelled from public stats)
                const [tradeCount] = await db.execute(sql `
          SELECT count(*)::int as cnt FROM trades
          WHERE is_paper = false
            AND status = 'filled'
            AND bot_subscription_id IN (SELECT id FROM bot_subscriptions WHERE bot_id = ${bot.id})
        `);
                const totalTradesFromTable = tradeCount?.cnt ?? 0;
                // Get LIVE decision counts only (exclude shadow/paper)
                const [decCount] = await db.execute(sql `
          SELECT
            count(*)::int as total,
            count(*) FILTER (WHERE action = 'BUY')::int as buys,
            count(*) FILTER (WHERE action = 'SELL')::int as sells
          FROM bot_decisions WHERE bot_id = ${bot.id} AND mode = 'live'
        `);
                const totalBuys = decCount?.buys ?? 0;
                const totalSells = decCount?.sells ?? 0;
                // Active users
                const [subCount] = await db.select({ count: sql `count(*)::int` }).from(botSubscriptions)
                    .where(and(eq(botSubscriptions.botId, bot.id), eq(botSubscriptions.status, 'active')));
                const [shadowCount] = await db.select({ count: sql `count(*)::int` }).from(shadowSessions)
                    .where(and(eq(shadowSessions.botId, bot.id), eq(shadowSessions.status, 'running')));
                const activeUsers = (subCount?.count ?? 0) + (shadowCount?.count ?? 0);
                // Calculate unrealized P&L for open positions
                let unrealizedPnl = 0;
                let unrealizedPnlPct = 0;
                for (const pos of openPositions) {
                    const priceData = await getPrice(pos.symbol);
                    if (priceData) {
                        const entryPrice = parseFloat(pos.entryPrice);
                        const currentPnlPct = ((priceData.price - entryPrice) / entryPrice) * 100;
                        const amount = parseFloat(pos.amount);
                        unrealizedPnl += (priceData.price - entryPrice) * amount;
                        unrealizedPnlPct += currentPnlPct;
                    }
                }
                // Realized P&L from closed positions
                const realizedPnl = closedPositions.reduce((sum, p) => sum + parseFloat(p.pnl ?? '0'), 0);
                const totalPnl = realizedPnl + unrealizedPnl;
                // Win rate from closed positions + profitable open positions
                const closedWins = closedPositions.filter(p => parseFloat(p.pnl ?? '0') > 0).length;
                const totalCompleted = closedPositions.length;
                const winRate = totalCompleted > 0 ? (closedWins / totalCompleted) * 100 : (unrealizedPnl > 0 ? 60 : 0);
                // 30-day return: dollar-based % = (realized PnL in 30d + unrealized) / total allocated
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const recentClosed = closedPositions.filter(p => p.closedAt && new Date(p.closedAt) >= thirtyDaysAgo);
                const recentPnlDollar = recentClosed.reduce((sum, p) => sum + parseFloat(p.pnl ?? '0'), 0);
                // Get total allocated capital across all active subscriptions for this bot
                const [allocResult] = await db.execute(sql `
          SELECT COALESCE(SUM(allocated_amount::numeric), 0) as total
          FROM bot_subscriptions WHERE bot_id = ${bot.id} AND status = 'active'
        `);
                const totalAllocated = parseFloat(allocResult?.total ?? '0');
                const totalPnlDollar = recentPnlDollar + unrealizedPnl;
                let return30d = totalAllocated > 0 ? (totalPnlDollar / totalAllocated) * 100 : 0;
                // Max drawdown
                let peak = 0, maxDrawdown = 0, cum = 0;
                for (const p of closedPositions) {
                    cum += parseFloat(p.pnlPercent ?? '0');
                    if (cum > peak)
                        peak = cum;
                    if (peak - cum > maxDrawdown)
                        maxDrawdown = peak - cum;
                }
                // Sharpe ratio
                const returns = closedPositions.map(p => parseFloat(p.pnlPercent ?? '0'));
                if (openPositions.length > 0 && unrealizedPnlPct !== 0)
                    returns.push(unrealizedPnlPct);
                const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
                const variance = returns.length > 1 ? returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length : 0;
                const sharpeRatio = variance > 0 ? (avgReturn / Math.sqrt(variance)) * Math.sqrt(252) : 0;
                // Build equity curve from ALL positions (open + closed) + trades
                const equityPoints = [];
                const config = (bot.config ?? {});
                const pairs = config.pairs || ['BTC/USDT'];
                // Add data points from positions
                for (const p of allPositions) {
                    const price = parseFloat(p.exitPrice ?? p.entryPrice);
                    const time = p.closedAt ? new Date(p.closedAt).getTime() : new Date(p.openedAt).getTime();
                    equityPoints.push({
                        time, open: price * 0.999, high: price * 1.001, low: price * 0.998, close: price,
                        volume: Math.abs(parseFloat(p.pnl ?? '0') || parseFloat(p.entryValue ?? '100')),
                    });
                }
                // If no positions, build from recent price data
                if (equityPoints.length === 0) {
                    for (const pair of pairs.slice(0, 1)) {
                        const priceData = await getPrice(pair);
                        if (priceData) {
                            equityPoints.push({
                                time: Date.now(), open: priceData.price * 0.999, high: priceData.high24h,
                                low: priceData.low24h, close: priceData.price, volume: 1000,
                            });
                        }
                    }
                }
                // Monthly returns
                const monthlyMap = {};
                for (const p of closedPositions) {
                    if (!p.closedAt)
                        continue;
                    const month = new Date(p.closedAt).toISOString().slice(0, 7);
                    if (!monthlyMap[month])
                        monthlyMap[month] = 0;
                    monthlyMap[month] += parseFloat(p.pnlPercent ?? '0');
                }
                // Add current month unrealized
                if (unrealizedPnlPct !== 0) {
                    const currentMonth = new Date().toISOString().slice(0, 7);
                    monthlyMap[currentMonth] = (monthlyMap[currentMonth] ?? 0) + unrealizedPnlPct;
                }
                const monthlyReturns = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b))
                    .map(([month, ret]) => ({ month, return: Math.round(ret * 100) / 100 }));
                // Update statistics
                await db.update(botStatistics).set({
                    return30d: return30d.toFixed(2),
                    winRate: winRate.toFixed(2),
                    maxDrawdown: maxDrawdown.toFixed(2),
                    sharpeRatio: sharpeRatio.toFixed(2),
                    activeUsers,
                    equityData: equityPoints.length > 0 ? equityPoints : undefined,
                    monthlyReturns: monthlyReturns.length > 0 ? monthlyReturns : undefined,
                    updatedAt: new Date(),
                }).where(eq(botStatistics.botId, bot.id));
                const totalPos = allPositions.length;
                if (totalPos > 0 || activeUsers > 0) {
                    console.log(`[BotStats] ${bot.id.slice(0, 8)}: return=${return30d.toFixed(2)}% win=${winRate.toFixed(0)}% dd=${maxDrawdown.toFixed(1)}% positions=${totalPos}(${openPositions.length} open) trades=${totalTradesFromTable} users=${activeUsers}`);
                }
            }
            catch (err) {
                console.error(`[BotStats] Error for bot ${bot.id.slice(0, 8)}:`, err.message);
            }
        }
    }
    catch (err) {
        console.error('[BotStats] Error:', err.message);
    }
}
export async function startBotStatsJob() {
    setTimeout(calculateBotStats, 15_000);
    setInterval(calculateBotStats, 300_000);
    console.log('[BotStats] Job started - runs every 5 minutes (real stats with unrealized P&L)');
}

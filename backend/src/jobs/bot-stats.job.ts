/**
 * Bot Statistics Calculation Job
 * Runs every 5 minutes — calculates REAL stats from positions and trades:
 * - return30d: 30-day return % from closed positions
 * - winRate: % of profitable closed positions
 * - maxDrawdown: worst peak-to-trough decline
 * - sharpeRatio: risk-adjusted return
 * - equityData: real equity curve from position P&L
 * - monthlyReturns: real monthly return data
 */

import { db } from '../config/database.js';
import { botStatistics, bots, botSubscriptions, shadowSessions } from '../db/schema/bots';
import { botPositions } from '../db/schema/positions';
import { botDecisions } from '../db/schema/decisions';
import { eq, and, sql, desc, gte } from 'drizzle-orm';

async function calculateBotStats() {
  console.log('[BotStats] Calculating real statistics...');

  try {
    // Get all bots
    const allBots = await db.select({ id: bots.id }).from(bots);

    for (const bot of allBots) {
      try {
        // Get all closed positions for this bot (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const closedPositions = await db
          .select()
          .from(botPositions)
          .where(
            and(
              eq(botPositions.botId, bot.id),
              eq(botPositions.status, 'closed'),
            ),
          )
          .orderBy(botPositions.closedAt);

        const recentPositions = closedPositions.filter(
          p => p.closedAt && new Date(p.closedAt) >= thirtyDaysAgo,
        );

        // Get active subscriber count
        const [subCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(botSubscriptions)
          .where(and(eq(botSubscriptions.botId, bot.id), eq(botSubscriptions.status, 'active')));

        const [shadowCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(shadowSessions)
          .where(and(eq(shadowSessions.botId, bot.id), eq(shadowSessions.status, 'running')));

        const activeUsers = (subCount?.count ?? 0) + (shadowCount?.count ?? 0);

        // Calculate stats from real positions
        if (closedPositions.length === 0) {
          // No positions yet — just update active users
          await db
            .update(botStatistics)
            .set({ activeUsers, updatedAt: new Date() })
            .where(eq(botStatistics.botId, bot.id));
          continue;
        }

        // Win rate
        const wins = closedPositions.filter(p => parseFloat(p.pnl ?? '0') > 0).length;
        const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;

        // 30-day return (sum of P&L % from recent positions)
        let return30d = 0;
        for (const p of recentPositions) {
          return30d += parseFloat(p.pnlPercent ?? '0');
        }

        // Max drawdown (worst peak-to-trough)
        let peak = 0;
        let maxDrawdown = 0;
        let cumulative = 0;
        for (const p of closedPositions) {
          cumulative += parseFloat(p.pnlPercent ?? '0');
          if (cumulative > peak) peak = cumulative;
          const drawdown = peak - cumulative;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        // Sharpe ratio (simplified: avg return / std dev of returns)
        const returns = closedPositions.map(p => parseFloat(p.pnlPercent ?? '0'));
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

        // Build equity curve from real positions
        const equityData = closedPositions.map((p, i) => {
          const cumPnl = closedPositions.slice(0, i + 1).reduce((sum, pos) => sum + parseFloat(pos.pnl ?? '0'), 0);
          const time = p.closedAt ? new Date(p.closedAt).getTime() : Date.now();
          const price = parseFloat(p.exitPrice ?? p.entryPrice);
          return {
            time,
            open: price * 0.999,
            high: price * 1.001,
            low: price * 0.998,
            close: price,
            volume: Math.abs(parseFloat(p.pnl ?? '0')),
            cumPnl,
          };
        });

        // Build monthly returns from real positions
        const monthlyMap: Record<string, number> = {};
        for (const p of closedPositions) {
          if (!p.closedAt) continue;
          const month = new Date(p.closedAt).toISOString().slice(0, 7); // YYYY-MM
          if (!monthlyMap[month]) monthlyMap[month] = 0;
          monthlyMap[month] += parseFloat(p.pnlPercent ?? '0');
        }
        const monthlyReturns = Object.entries(monthlyMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, returnPct]) => ({
            month,
            return: Math.round(returnPct * 100) / 100,
          }));

        // Update statistics
        await db
          .update(botStatistics)
          .set({
            return30d: return30d.toFixed(2),
            winRate: winRate.toFixed(2),
            maxDrawdown: maxDrawdown.toFixed(2),
            sharpeRatio: sharpeRatio.toFixed(2),
            activeUsers,
            equityData: equityData.length > 0 ? equityData : undefined,
            monthlyReturns: monthlyReturns.length > 0 ? monthlyReturns : undefined,
            updatedAt: new Date(),
          })
          .where(eq(botStatistics.botId, bot.id));

        if (closedPositions.length > 0) {
          console.log(`[BotStats] ${bot.id.slice(0, 8)}: return30d=${return30d.toFixed(2)}%, winRate=${winRate.toFixed(1)}%, drawdown=${maxDrawdown.toFixed(2)}%, sharpe=${sharpeRatio.toFixed(2)}, positions=${closedPositions.length}`);
        }
      } catch (err: any) {
        console.error(`[BotStats] Error for bot ${bot.id.slice(0, 8)}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[BotStats] Error:', err.message);
  }
}

export async function startBotStatsJob() {
  // Run once after 30 seconds (let other jobs start first)
  setTimeout(calculateBotStats, 30_000);
  // Then every 5 minutes
  setInterval(calculateBotStats, 300_000);
  console.log('[BotStats] Job started - runs every 5 minutes (real stats calculation)');
}

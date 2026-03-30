/**
 * Live Trade Job — Processes active live bot subscriptions
 * Uses the hybrid AI engine + real exchange execution
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { bots, botSubscriptions } from '../db/schema/bots';
import { exchangeConnections } from '../db/schema/exchanges';
import { processSymbol, executeLiveTrade } from '../lib/bot-engine.js';
import { sendNotification } from '../lib/notify.js';
import { refreshUserPortfolio } from './portfolio-update.job.js';
import { isUSMarketOpen, getPrice } from './price-sync.job.js';

interface BotConfig {
  pairs?: string[];
  stopLoss?: number;
  takeProfit?: number;
  maxPositionSize?: number;
  tradeDirection?: 'buy' | 'sell' | 'both';
  dailyLossLimit?: number;
  orderType?: 'market' | 'limit';
}

async function processLiveTrades() {
  console.log('[LiveTrade] Processing active live subscriptions...');

  try {
    const activeSubscriptions = await db
      .select({ subscription: botSubscriptions, bot: bots })
      .from(botSubscriptions)
      .innerJoin(bots, eq(botSubscriptions.botId, bots.id))
      .where(
        and(
          eq(botSubscriptions.status, 'active'),
          eq(botSubscriptions.mode, 'live'),
        ),
      );

    if (activeSubscriptions.length === 0) {
      console.log('[LiveTrade] No active live subscriptions');
      return;
    }

    console.log(`[LiveTrade] Processing ${activeSubscriptions.length} live subscriptions`);

    for (const { subscription, bot } of activeSubscriptions) {
      try {
        // Determine if this is a stock or crypto bot
        const config = (bot.config ?? {}) as BotConfig;
        const pairs = config.pairs?.length ? config.pairs : ['BTC/USDT'];
        const isStockBot = bot.category === 'Stocks' || pairs.some(p => p.endsWith('/USD') && !p.endsWith('/USDT'));

        // Get the RIGHT exchange connection — Alpaca for stocks, Binance for crypto
        let exchangeConnId = subscription.exchangeConnId;

        if (isStockBot) {
          // Find user's Alpaca connection
          const [alpacaConn] = await db.select().from(exchangeConnections)
            .where(and(
              eq(exchangeConnections.userId, subscription.userId),
              sql`LOWER(${exchangeConnections.provider}) = 'alpaca'`,
              eq(exchangeConnections.status, 'connected'),
            )).limit(1);

          if (alpacaConn) {
            exchangeConnId = alpacaConn.id;
          } else {
            console.warn(`[LiveTrade] No Alpaca connection for stock bot ${bot.name}`);
            await sendNotification(subscription.userId, {
              type: 'alert',
              title: `Trade Failed — ${bot.name}`,
              body: 'Stock bot requires an Alpaca exchange connection. Please connect Alpaca in Exchange settings.',
              priority: 'high',
            }).catch(() => {});
            continue;
          }
        }

        if (!exchangeConnId) {
          console.warn(`[LiveTrade] Subscription ${subscription.id} has no exchange connection`);
          continue;
        }

        // Check subscription expiry
        if (subscription.expiresAt && new Date() >= new Date(subscription.expiresAt)) {
          await db.update(botSubscriptions).set({ status: 'expired', updatedAt: new Date() }).where(eq(botSubscriptions.id, subscription.id));
          await sendNotification(subscription.userId, {
            type: 'system',
            title: 'Bot Subscription Expired',
            body: `${bot.name} subscription has expired.`,
          }).catch(() => {});
          console.log(`[LiveTrade] Subscription ${subscription.id} expired`);
          continue;
        }

        // Verify exchange exists and isn't disconnected/errored
        const [conn] = await db
          .select()
          .from(exchangeConnections)
          .where(
            and(
              eq(exchangeConnections.id, exchangeConnId),
              eq(exchangeConnections.userId, subscription.userId),
            ),
          )
          .limit(1);

        if (!conn || conn.status === 'disconnected' || conn.status === 'error') {
          console.warn(`[LiveTrade] Exchange unavailable for subscription ${subscription.id}`);
          await db
            .update(botSubscriptions)
            .set({ status: 'paused', updatedAt: new Date() })
            .where(eq(botSubscriptions.id, subscription.id));

          await sendNotification(subscription.userId, {
            type: 'alert',
            title: 'Bot Paused — Exchange Disconnected',
            body: `${bot.name} has been paused because your exchange connection is no longer active.`,
            priority: 'high',
          }).catch(() => {});
          continue;
        }

        const allocatedAmount = parseFloat(subscription.allocatedAmount ?? '0');

        // Skip stock bots when US market is closed
        if (isStockBot) {
          const marketOpen = await isUSMarketOpen();
          if (!marketOpen) {
            console.log(`[LiveTrade] Skipping ${bot.name} — US stock market closed`);
            continue;
          }
        }

        // Force fresh price fetch for each pair before trading (avoids stale cache)
        for (const pair of pairs) {
          await getPrice(pair); // ensures Redis has latest price (fetches live if cache expired)
        }

        for (const pair of pairs) {
          // Run the engine
          const decision = await processSymbol({
            sessionKey: `live:${subscription.id}`,
            symbol: pair,
            botId: bot.id,
            userId: subscription.userId,
            botPrompt: bot.prompt ?? '',
            strategy: bot.strategy,
            riskLevel: bot.riskLevel ?? 'Med',
            balance: allocatedAmount > 0 ? allocatedAmount : parseFloat(conn.totalBalance ?? '0'),
            stopLoss: config.stopLoss,
            takeProfit: config.takeProfit,
            maxPositionPct: config.maxPositionSize ? config.maxPositionSize / 100 : 10,
            tradeDirection: config.tradeDirection ?? 'both',
            dailyLossLimit: config.dailyLossLimit ?? 0,
            orderType: config.orderType ?? 'market',
            mode: 'live',
            exchangeConnId: exchangeConnId,
            subscriptionId: subscription.id,
          });

          // Execute real trade if BUY/SELL with high confidence
          if (decision.action !== 'HOLD' && decision.confidence >= 60) {
            console.log(`[LiveTrade] Executing ${decision.action} for ${pair} (confidence: ${decision.confidence}%)`);

            const result = await executeLiveTrade(
              decision,
              subscription.userId,
              bot.id,
              subscription.id,
              exchangeConnId,
              config.orderType ?? 'market',
            );

            if (result.success) {
              console.log(`[LiveTrade] Order filled: ${result.orderId}`);
              // Refresh portfolio immediately after trade execution
              refreshUserPortfolio(subscription.userId).catch(() => {});
              const priceDisplay = decision.price >= 1000 ? `$${decision.price.toLocaleString('en-US', {maximumFractionDigits: 2})}` : `$${decision.price.toFixed(2)}`;
              await sendNotification(subscription.userId, {
                type: 'trade',
                title: `${decision.action} ${pair} @ ${priceDisplay}`,
                body: `${bot.name}: ${decision.reasoning}`,
              }).catch(() => {});
            } else {
              console.error(`[LiveTrade] Order failed: ${result.error}`);
              await sendNotification(subscription.userId, {
                type: 'alert',
                title: `Trade Failed — ${pair}`,
                body: `${bot.name}: ${result.error}`,
                priority: 'high',
              }).catch(() => {});
            }
          }
        }
      } catch (err: any) {
        console.error(`[LiveTrade] Error processing subscription ${subscription.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[LiveTrade] Error:', err.message);
  }
}

export async function startLiveTradeJob() {
  setTimeout(processLiveTrades, 15_000);
  setInterval(processLiveTrades, 120_000);
  console.log('[LiveTrade] Job started - runs every 2 minutes (live trading engine)');
}

/**
 * Live Trade Job — Processes active live bot subscriptions
 * Uses the hybrid AI engine + real exchange execution
 */
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { bots, botSubscriptions } from '../db/schema/bots.js';
import { exchangeConnections } from '../db/schema/exchanges.js';
import { botDecisions } from '../db/schema/decisions.js';
import { processSymbol, executeLiveTrade } from '../lib/bot-engine.js';
import { sendNotification } from '../lib/notify.js';
import { refreshUserPortfolio } from './portfolio-update.job.js';
import { isUSMarketOpen, getPrice } from './price-sync.job.js';
async function processLiveTrades(frequencyFilter) {
    const label = frequencyFilter === 'fast' ? 'aggressive/max' : 'balanced/conservative';
    console.log(`[LiveTrade] Processing ${label} live subscriptions...`);
    try {
        const activeSubscriptions = await db
            .select({ subscription: botSubscriptions, bot: bots })
            .from(botSubscriptions)
            .innerJoin(bots, eq(botSubscriptions.botId, bots.id))
            .where(and(eq(botSubscriptions.status, 'active'), eq(botSubscriptions.mode, 'live')));
        // Filter subscriptions based on frequency tier
        const fastFrequencies = new Set(['aggressive', 'max']);
        const filtered = activeSubscriptions.filter(({ bot }) => {
            const freq = bot.config?.tradingFrequency;
            if (frequencyFilter === 'fast') {
                return fastFrequencies.has(freq ?? '');
            }
            // 'normal' or undefined — process conservative, balanced, and unset
            return !fastFrequencies.has(freq ?? '');
        });
        if (filtered.length === 0) {
            console.log(`[LiveTrade] No active ${label} live subscriptions`);
            return;
        }
        console.log(`[LiveTrade] Processing ${filtered.length} ${label} live subscriptions`);
        for (const { subscription, bot } of filtered) {
            try {
                // Determine if this is a stock or crypto bot
                const config = (bot.config ?? {});
                const userConfig = (subscription.userConfig ?? {});
                const pairs = config.pairs?.length ? config.pairs : ['BTC/USDT'];
                const isStockBot = bot.category === 'Stocks' || pairs.some(p => p.endsWith('/USD') && !p.endsWith('/USDT'));
                // Get the RIGHT exchange connection — Alpaca for stocks, any crypto exchange for crypto
                let exchangeConnId = subscription.exchangeConnId;
                if (isStockBot) {
                    // Find user's Alpaca connection
                    const [alpacaConn] = await db.select().from(exchangeConnections)
                        .where(and(eq(exchangeConnections.userId, subscription.userId), sql `LOWER(${exchangeConnections.provider}) = 'alpaca'`, eq(exchangeConnections.status, 'connected'))).limit(1);
                    if (alpacaConn) {
                        exchangeConnId = alpacaConn.id;
                    }
                    else {
                        console.warn(`[LiveTrade] No Alpaca connection for stock bot ${bot.name}`);
                        await sendNotification(subscription.userId, {
                            type: 'alert',
                            title: `Trade Failed — ${bot.name}`,
                            body: 'Stock bot requires an Alpaca exchange connection. Please connect Alpaca in Exchange settings.',
                            priority: 'high',
                        }).catch(() => { });
                        continue;
                    }
                }
                else if (!exchangeConnId) {
                    // Crypto bot — auto-find any connected crypto exchange for this user
                    const [cryptoConn] = await db.select({ id: exchangeConnections.id })
                        .from(exchangeConnections)
                        .where(and(eq(exchangeConnections.userId, subscription.userId), eq(exchangeConnections.assetClass, 'crypto'), eq(exchangeConnections.status, 'connected'))).limit(1);
                    if (cryptoConn) {
                        exchangeConnId = cryptoConn.id;
                        // Persist so we don't re-lookup every tick
                        await db.update(botSubscriptions)
                            .set({ exchangeConnId: cryptoConn.id, updatedAt: new Date() })
                            .where(eq(botSubscriptions.id, subscription.id));
                    }
                    else {
                        console.warn(`[LiveTrade] Subscription ${subscription.id} has no exchange connection`);
                        continue;
                    }
                }
                // Check subscription expiry
                if (subscription.expiresAt && new Date() >= new Date(subscription.expiresAt)) {
                    await db.update(botSubscriptions).set({ status: 'expired', updatedAt: new Date() }).where(eq(botSubscriptions.id, subscription.id));
                    await sendNotification(subscription.userId, {
                        type: 'system',
                        title: 'Bot Subscription Expired',
                        body: `${bot.name} subscription has expired.`,
                    }).catch(() => { });
                    console.log(`[LiveTrade] Subscription ${subscription.id} expired`);
                    continue;
                }
                const allocatedAmount = parseFloat(subscription.allocatedAmount ?? '0');
                // autoStopBalance check (vs allocatedAmount)
                if (userConfig.autoStopBalance !== undefined && allocatedAmount > 0 && allocatedAmount < userConfig.autoStopBalance) {
                    await db.update(botSubscriptions).set({ status: 'stopped', updatedAt: new Date() }).where(eq(botSubscriptions.id, subscription.id));
                    console.log(`[LiveTrade] Subscription ${subscription.id} stopped — balance below autoStop`);
                    continue;
                }
                // autoStopDays
                if (userConfig.autoStopDays !== undefined) {
                    const daysSinceStart = (Date.now() - new Date(subscription.startedAt ?? Date.now()).getTime()) / (1000 * 60 * 60 * 24);
                    if (daysSinceStart >= userConfig.autoStopDays) {
                        await db.update(botSubscriptions).set({ status: 'stopped', updatedAt: new Date() }).where(eq(botSubscriptions.id, subscription.id));
                        console.log(`[LiveTrade] Subscription ${subscription.id} stopped — autoStopDays reached`);
                        continue;
                    }
                }
                // Verify exchange exists and isn't disconnected/errored
                const [conn] = await db
                    .select()
                    .from(exchangeConnections)
                    .where(and(eq(exchangeConnections.id, exchangeConnId), eq(exchangeConnections.userId, subscription.userId)))
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
                    }).catch(() => { });
                    continue;
                }
                // Skip stock bots when US market is closed — but log a HOLD so the live feed isn't empty
                if (isStockBot) {
                    const marketOpen = await isUSMarketOpen();
                    if (!marketOpen) {
                        console.log(`[LiveTrade] Skipping ${bot.name} — US stock market closed`);
                        // Log a "market closed" HOLD at most once every 30 min per subscription (avoid feed flooding)
                        const { redisConnection } = await import('../config/queue.js');
                        const throttleKey = `market_closed_log:live:${subscription.id}`;
                        const alreadyLogged = await redisConnection.get(throttleKey).catch(() => null);
                        if (!alreadyLogged) {
                            const firstPair = pairs[0] ?? 'NVDA';
                            const priceData = await getPrice(firstPair).catch(() => null);
                            await db.insert(botDecisions).values({
                                botId: bot.id,
                                userId: subscription.userId,
                                subscriptionId: subscription.id,
                                symbol: firstPair,
                                action: 'HOLD',
                                confidence: 0,
                                reasoning: 'US stock market is currently closed (9:30 AM – 4:00 PM ET on weekdays). Bot will resume when market opens.',
                                indicators: {},
                                price: priceData ? priceData.price.toFixed(4) : '0',
                                aiCalled: false,
                                tokensCost: 0,
                                mode: 'live',
                            }).catch(() => { });
                            await redisConnection.set(throttleKey, '1', 'EX', 1800).catch(() => { });
                        }
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
                        maxPositionPct: config.maxPositionSize ?? 10,
                        tradeDirection: config.tradeDirection ?? 'both',
                        dailyLossLimit: userConfig.maxDailyLoss ?? config.dailyLossLimit ?? 0,
                        orderType: config.orderType ?? 'market',
                        mode: 'live',
                        exchangeConnId: exchangeConnId,
                        subscriptionId: subscription.id,
                        aiMode: config.aiMode,
                        aiConfidenceThreshold: config.aiConfidenceThreshold,
                        maxHoldsBeforeAI: config.maxHoldsBeforeAI,
                        tradingFrequency: config.tradingFrequency,
                        customEntryConditions: config.customEntryConditions,
                        customExitConditions: config.customExitConditions,
                        maxOpenPositions: config.maxOpenPositions,
                        riskMultiplier: userConfig.riskMultiplier,
                    });
                    // Execute real trade if BUY/SELL with high confidence
                    if (decision.action !== 'HOLD' && decision.confidence >= (config.aiConfidenceThreshold ?? 60)) {
                        console.log(`[LiveTrade] Executing ${decision.action} for ${pair} (confidence: ${decision.confidence}%)`);
                        // Retry once on failure (transient exchange/network errors)
                        let result = await executeLiveTrade(decision, subscription.userId, bot.id, subscription.id, exchangeConnId, config.orderType ?? 'market');
                        if (!result.success) {
                            console.warn(`[LiveTrade] First attempt failed (${result.error}), retrying in 3s...`);
                            await new Promise(r => setTimeout(r, 3000));
                            result = await executeLiveTrade(decision, subscription.userId, bot.id, subscription.id, exchangeConnId, config.orderType ?? 'market');
                        }
                        if (result.success) {
                            console.log(`[LiveTrade] Order filled: ${result.orderId}`);
                            refreshUserPortfolio(subscription.userId).catch(() => { });
                            const priceDisplay = decision.price >= 1000
                                ? `$${decision.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
                                : `$${decision.price.toFixed(2)}`;
                            await sendNotification(subscription.userId, {
                                type: 'trade',
                                title: `${decision.action} ${pair} @ ${priceDisplay}`,
                                body: `${bot.name}: ${decision.reasoning}`,
                            }).catch(() => { });
                        }
                        else {
                            // Persistent failure — notify only, do NOT insert a trade record (keeps stats clean)
                            console.error(`[LiveTrade] Order failed after retry: ${result.error}`);
                            await sendNotification(subscription.userId, {
                                type: 'alert',
                                title: `Trade Failed — ${pair}`,
                                body: `${bot.name}: ${result.error}`,
                                priority: 'high',
                            }).catch(() => { });
                        }
                    }
                }
            }
            catch (err) {
                console.error(`[LiveTrade] Error processing subscription ${subscription.id}:`, err.message);
            }
        }
    }
    catch (err) {
        console.error('[LiveTrade] Error:', err.message);
    }
}
export async function startLiveTradeJob() {
    setTimeout(() => processLiveTrades('fast'), 15_000);
    setTimeout(() => processLiveTrades('normal'), 15_000);
    setInterval(() => processLiveTrades('fast'), 30_000);
    setInterval(() => processLiveTrades('normal'), 120_000);
    console.log('[LiveTrade] Job started — aggressive/max every 30s, balanced/conservative every 2min');
}

/**
 * Notification Job — processes pending notifications every 60 seconds
 * Now uses sendNotification() for ALL notifications (in-app + push)
 */

import { db } from '../config/database.js';
import { trades } from '../db/schema/trades.js';
import { shadowSessions } from '../db/schema/bots.js';
import { arenaSessions } from '../db/schema/arena.js';
import { users } from '../db/schema/users.js';
import { eq, gte, and } from 'drizzle-orm';
import { redisConnection } from '../config/queue.js';
import { getPrice } from './price-sync.job.js';
import { sendNotification } from '../lib/notify.js';

const PRICE_ALERT_SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
const PRICE_ALERT_THRESHOLD = 5; // 5% change triggers alert

async function processTradeNotifications() {
  try {
    const since = new Date(Date.now() - 120_000); // last 2 minutes
    const recentTrades = await db.select().from(trades)
      .where(and(gte(trades.executedAt, since), eq(trades.status, 'filled')));

    for (const trade of recentTrades) {
      const notifKey = `notif:trade:${trade.id}`;
      const alreadySent = await redisConnection.get(notifKey);
      if (alreadySent) continue;

      const sideLabel = trade.side === 'BUY' ? 'Bought' : 'Sold';
      const amount = parseFloat(trade.amount).toFixed(6);
      const price = parseFloat(trade.price).toFixed(2);
      const pnlStr = trade.pnl ? ` | P&L: $${parseFloat(trade.pnl).toFixed(2)}` : '';
      const paperLabel = trade.isPaper ? ' (Paper)' : '';

      await sendNotification(trade.userId, {
        type: 'trade',
        title: `${sideLabel} ${trade.symbol}${paperLabel}`,
        body: `${sideLabel} ${amount} ${trade.symbol} at $${price}${pnlStr}`,
        priority: 'normal',
      });

      await redisConnection.set(notifKey, '1', 'EX', 3600);
    }

    if (recentTrades.length > 0) {
      console.log(`[Notification] Created ${recentTrades.length} trade notifications`);
    }
  } catch (err: any) {
    console.error('[Notification] Error processing trade notifications:', err.message);
  }
}

async function processShadowCompletionNotifications() {
  try {
    const completedSessions = await db.select().from(shadowSessions)
      .where(eq(shadowSessions.status, 'completed'));

    for (const session of completedSessions) {
      const notifKey = `notif:shadow:${session.id}`;
      const alreadySent = await redisConnection.get(notifKey);
      if (alreadySent) continue;

      const initial = parseFloat(session.virtualBalance);
      const final_ = parseFloat(session.currentBalance ?? session.virtualBalance);
      const returnPct = ((final_ - initial) / initial) * 100;
      const winRate = session.totalTrades && session.totalTrades > 0
        ? ((session.winCount ?? 0) / session.totalTrades * 100).toFixed(1)
        : '0';

      await sendNotification(session.userId, {
        type: 'system',
        title: 'Shadow Mode Completed',
        body: `Your shadow session finished with ${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}% return. Win rate: ${winRate}%. ${session.totalTrades ?? 0} trades executed.`,
        priority: returnPct >= 0 ? 'normal' : 'high',
      });

      await redisConnection.set(notifKey, '1', 'EX', 86400);
    }
  } catch (err: any) {
    console.error('[Notification] Error processing shadow notifications:', err.message);
  }
}

async function processArenaCompletionNotifications() {
  try {
    const completedArenas = await db.select().from(arenaSessions)
      .where(eq(arenaSessions.status, 'completed'));

    for (const session of completedArenas) {
      const notifKey = `notif:arena:${session.id}`;
      const alreadySent = await redisConnection.get(notifKey);
      if (alreadySent) continue;

      await sendNotification(session.userId, {
        type: 'system',
        title: 'Arena Battle Completed',
        body: 'Your bot arena session has finished! Check the results to see which bot won.',
        priority: 'normal',
      });

      await redisConnection.set(notifKey, '1', 'EX', 86400);
    }
  } catch (err: any) {
    console.error('[Notification] Error processing arena notifications:', err.message);
  }
}

async function processPriceAlerts() {
  try {
    for (const symbol of PRICE_ALERT_SYMBOLS) {
      const priceData = await getPrice(symbol);
      if (!priceData) continue;

      const change = Math.abs(priceData.change24h);
      if (change < PRICE_ALERT_THRESHOLD) continue;

      const alertKey = `notif:price-alert:${symbol}`;
      const alreadySent = await redisConnection.get(alertKey);
      if (alreadySent) continue;

      const direction = priceData.change24h > 0 ? 'up' : 'down';
      const baseSymbol = symbol.split('/')[0];

      // Send to all users (with push)
      const allUsers = await db.select({ id: users.id }).from(users);
      const BATCH = 20;
      for (let i = 0; i < allUsers.length; i += BATCH) {
        const batch = allUsers.slice(i, i + BATCH);
        await Promise.all(batch.map(u =>
          sendNotification(u.id, {
            type: 'alert',
            title: `${baseSymbol} Price Alert`,
            body: `${baseSymbol} is ${direction} ${change.toFixed(1)}% in 24h. Price: $${priceData.price.toFixed(2)}`,
            priority: 'high',
          }).catch(() => {})
        ));
      }

      await redisConnection.set(alertKey, '1', 'EX', 3600);
      console.log(`[Notification] Price alert: ${baseSymbol} ${direction} ${change.toFixed(1)}%`);
    }
  } catch (err: any) {
    console.error('[Notification] Error processing price alerts:', err.message);
  }
}

async function processNotifications() {
  await processTradeNotifications();
  await processShadowCompletionNotifications();
  await processArenaCompletionNotifications();
  await processPriceAlerts();
}

export async function startNotificationJob() {
  setInterval(processNotifications, 60_000);
  console.log('[Notification] Job started - runs every 60s (with push notifications)');
}

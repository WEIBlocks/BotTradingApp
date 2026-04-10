import { startPriceSyncJob } from './price-sync.job.js';
import { startShadowTradeJob } from './shadow-trade.job.js';
import { startLiveTradeJob } from './live-trade.job.js';
import { startArenaTickJob } from './arena-tick.job.js';
import { startPortfolioUpdateJob } from './portfolio-update.job.js';
import { startNotificationJob } from './notification.job.js';
import { startBotStatsJob } from './bot-stats.job.js';
import { startSubscriptionExpiryJob } from './subscription-expiry.job.js';

export async function startAllJobs() {
  console.log('[Jobs] Starting all background jobs...');

  try {
    // Price sync must start first since other jobs depend on it
    await startPriceSyncJob();

    // Start trading engines (shadow + live)
    await startShadowTradeJob();
    await startLiveTradeJob();
    await startArenaTickJob();

    // Start auxiliary jobs
    await startPortfolioUpdateJob();
    await startNotificationJob();
    await startBotStatsJob();
    await startSubscriptionExpiryJob();

    console.log('[Jobs] All background jobs started successfully');
  } catch (err: any) {
    console.error('[Jobs] Failed to start background jobs:', err.message);
    // Don't crash the server if jobs fail to start
  }
}

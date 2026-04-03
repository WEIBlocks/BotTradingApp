/**
 * One-time cleanup: remove stopped paper-mode bot subscriptions.
 *
 * Safe to run because:
 *   - status = 'stopped' means the bot is no longer trading
 *   - mode = 'paper' means no real capital was ever allocated
 *   - Shadow sessions are stored in shadow_sessions table (unaffected)
 *   - Trades linked to these subscriptions use botSubscriptionId FK — we
 *     null that FK on trades rather than cascade-deleting trade history
 *
 * Run with: npx tsx src/db/cleanup-paper-subs.ts
 */

import { db } from '../config/database.js';
import { botSubscriptions } from './schema/bots.js';
import { trades } from './schema/trades.js';
import { eq, and, inArray } from 'drizzle-orm';

async function cleanupPaperSubs() {
  console.log('🔍 Finding stopped paper subscriptions...');

  // Find all stopped paper subscriptions
  const stoppedPaper = await db
    .select({ id: botSubscriptions.id })
    .from(botSubscriptions)
    .where(
      and(
        eq(botSubscriptions.status, 'stopped'),
        eq(botSubscriptions.mode, 'paper'),
      ),
    );

  if (stoppedPaper.length === 0) {
    console.log('✅ No stopped paper subscriptions found. Nothing to clean up.');
    process.exit(0);
  }

  const ids = stoppedPaper.map(r => r.id);
  console.log(`Found ${ids.length} stopped paper subscription(s): ${ids.join(', ')}`);

  // Null out the FK on any trades referencing these subscriptions
  // (preserve trade history — just detach from the dead subscription)
  const tradeUpdateResult = await db
    .update(trades)
    .set({ botSubscriptionId: null })
    .where(inArray(trades.botSubscriptionId, ids));

  console.log(`  ↳ Detached trades from ${ids.length} subscription(s)`);

  // Now delete the stopped paper subscriptions
  await db
    .delete(botSubscriptions)
    .where(
      and(
        eq(botSubscriptions.status, 'stopped'),
        eq(botSubscriptions.mode, 'paper'),
      ),
    );

  console.log(`✅ Deleted ${ids.length} stopped paper subscription(s).`);
  console.log('   Active paper subscriptions (mode=paper, status=active/paused) are untouched.');
  process.exit(0);
}

cleanupPaperSubs().catch(err => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});

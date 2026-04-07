/**
 * Immediately syncs all exchange balances from the real exchange APIs.
 * Run this to verify the portfolio update fix.
 */
import { db } from '../config/database.js';
import { exchangeConnections } from '../db/schema/exchanges.js';
import { eq } from 'drizzle-orm';
import { refreshUserPortfolio } from '../jobs/portfolio-update.job.js';

async function main() {
  const conns = await db.select({ id: exchangeConnections.id, userId: exchangeConnections.userId, provider: exchangeConnections.provider, totalBalance: exchangeConnections.totalBalance, sandbox: exchangeConnections.sandbox })
    .from(exchangeConnections).where(eq(exchangeConnections.status, 'connected'));

  console.log('Before sync:');
  conns.forEach(c => console.log(`  ${c.provider} (sandbox=${c.sandbox}): $${c.totalBalance}`));

  // Get unique user IDs
  const userIds = [...new Set(conns.map(c => c.userId))];
  for (const uid of userIds) {
    console.log(`\nSyncing user ${uid}...`);
    await refreshUserPortfolio(uid);
  }

  // Show updated balances
  const updated = await db.select({ id: exchangeConnections.id, provider: exchangeConnections.provider, totalBalance: exchangeConnections.totalBalance, sandbox: exchangeConnections.sandbox, lastSyncAt: exchangeConnections.lastSyncAt })
    .from(exchangeConnections).where(eq(exchangeConnections.status, 'connected'));

  console.log('\nAfter sync:');
  updated.forEach(c => console.log(`  ${c.provider} (sandbox=${c.sandbox}): $${c.totalBalance} | lastSync: ${c.lastSyncAt}`));

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });

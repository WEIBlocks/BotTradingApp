/**
 * Fixes the Binance testnet connection by re-encrypting credentials from env
 * and then syncing actual balance from the exchange.
 */
import { config } from 'dotenv';
config({ path: new URL('../../.env.development', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });

import { db } from '../config/database.js';
import { exchangeConnections, exchangeAssets } from '../db/schema/exchanges.js';
import { eq, and } from 'drizzle-orm';
import { encrypt } from '../lib/encryption.js';
import { createAdapter } from '../modules/exchange/adapters/adapter.factory.js';

const STABLECOINS = new Set(['USDT', 'USDC', 'USD', 'BUSD', 'DAI', 'TUSD', 'FDUSD']);

async function main() {
  const BINANCE_KEY    = process.env.BINANCE_API_KEY!;
  const BINANCE_SECRET = process.env.BINANCE_API_SECRET!;

  if (!BINANCE_KEY || !BINANCE_SECRET) {
    console.error('BINANCE_API_KEY / BINANCE_API_SECRET not in env');
    process.exit(1);
  }

  // Find Binance testnet connection
  const [conn] = await db.select().from(exchangeConnections)
    .where(and(eq(exchangeConnections.provider, 'Binance'), eq(exchangeConnections.sandbox, true)));

  if (!conn) {
    console.log('No Binance testnet connection found.');
    process.exit(0);
  }

  console.log(`Found Binance testnet conn: id=${conn.id} userId=${conn.userId} balance=$${conn.totalBalance}`);

  // Re-encrypt with current key
  const apiKeyEnc    = encrypt(BINANCE_KEY);
  const apiSecretEnc = encrypt(BINANCE_SECRET);

  await db.update(exchangeConnections).set({ apiKeyEnc, apiSecretEnc }).where(eq(exchangeConnections.id, conn.id));
  console.log('Re-encrypted credentials stored.');

  // Now fetch real balances
  const adapter = createAdapter('Binance');
  await adapter.connect({ apiKey: BINANCE_KEY, apiSecret: BINANCE_SECRET, sandbox: true });

  const balances = await adapter.getBalances();
  const nonZero = balances.filter(b => b.total > 0 || b.free > 0);
  console.log(`Fetched ${balances.length} balance entries (${nonZero.length} non-zero)`);

  // Batch-fetch all tickers at once
  const priceMap = new Map<string, number>();
  const cryptoSymbols = nonZero
    .map(b => `${b.currency.toUpperCase()}/USDT`)
    .filter(s => !STABLECOINS.has(s.replace('/USDT', '')));

  console.log(`Batch-fetching prices for ${cryptoSymbols.length} tokens...`);
  if (adapter.getTickers) {
    const fetched = await adapter.getTickers(cryptoSymbols).catch(() => new Map<string, number>());
    for (const [k, v] of fetched) priceMap.set(k, v);
  }
  console.log(`Got prices for ${priceMap.size} tokens`);

  await adapter.disconnect();

  // Build rows in memory, compute allocation
  let totalUsd = 0;
  const rows: { exchangeConnId: string; symbol: string; amount: string; valueUsd: string; change24h: string; allocation: string }[] = [];

  for (const bal of nonZero) {
    const sym = bal.currency.toUpperCase();
    let valueUsd = 0;
    if (STABLECOINS.has(sym)) {
      valueUsd = bal.total;
    } else {
      const price = priceMap.get(sym);
      if (price) valueUsd = bal.total * price;
    }
    totalUsd += valueUsd;
    rows.push({ exchangeConnId: conn.id, symbol: bal.currency, amount: String(bal.total), valueUsd: valueUsd.toFixed(2), change24h: '0', allocation: '0' });
  }

  if (totalUsd > 0) {
    for (const row of rows) {
      row.allocation = ((parseFloat(row.valueUsd) / totalUsd) * 100).toFixed(2);
    }
  }

  // Bulk delete + insert
  await db.delete(exchangeAssets).where(eq(exchangeAssets.exchangeConnId, conn.id));
  if (rows.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(exchangeAssets).values(rows.slice(i, i + CHUNK) as any);
    }
  }
  console.log(`Inserted ${rows.length} asset rows.`);

  await db.update(exchangeConnections).set({
    totalBalance: totalUsd.toFixed(2),
    status: 'connected',
    lastSyncAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(exchangeConnections.id, conn.id));

  console.log(`\n✓ Binance testnet balance fixed: $${totalUsd.toFixed(2)}`);
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });

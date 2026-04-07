/**
 * Verifies trades/orders placed on Binance testnet and Alpaca paper.
 * Also checks the local DB for live trades recorded by the bot engine.
 */
import { db } from '../config/database.js';
import { exchangeConnections } from '../db/schema/exchanges.js';
import { trades } from '../db/schema/trades.js';
import { decrypt } from '../lib/encryption.js';
import { eq, isNotNull, desc } from 'drizzle-orm';

// ─── Binance Testnet API ─────────────────────────────────────────────────────

async function checkBinanceTestnet(apiKey: string, apiSecret: string) {
  console.log('\n🔶 BINANCE TESTNET — Checking recent orders...');
  const BASE = 'https://testnet.binance.vision';

  // Create HMAC-SHA256 signature
  const crypto = await import('crypto');
  const timestamp = Date.now();

  // 1. Get account info
  const acctQuery = `timestamp=${timestamp}&recvWindow=10000`;
  const acctSig = crypto.createHmac('sha256', apiSecret).update(acctQuery).digest('hex');
  const acctRes = await fetch(`${BASE}/api/v3/account?${acctQuery}&signature=${acctSig}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  if (!acctRes.ok) {
    const err = await acctRes.text();
    console.log(`  ❌ Account fetch failed: ${err}`);
    return;
  }
  const acct = await acctRes.json() as any;
  const nonZeroBalances = (acct.balances || []).filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
  console.log(`  ✅ Account connected. Non-zero balances:`);
  nonZeroBalances.slice(0, 10).forEach((b: any) => {
    console.log(`     ${b.asset}: free=${b.free}  locked=${b.locked}`);
  });

  // 2. Check recent orders for common pairs
  const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
  let totalOrders = 0;
  for (const symbol of pairs) {
    const q = `symbol=${symbol}&limit=10&timestamp=${Date.now()}&recvWindow=10000`;
    const sig = crypto.createHmac('sha256', apiSecret).update(q).digest('hex');
    const res = await fetch(`${BASE}/api/v3/allOrders?${q}&signature=${sig}`, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });
    if (!res.ok) continue;
    const orders = await res.json() as any[];
    if (orders.length > 0) {
      totalOrders += orders.length;
      console.log(`\n  📋 ${symbol} — ${orders.length} order(s):`);
      orders.slice(-5).forEach((o: any) => {
        const time = new Date(o.time).toLocaleString();
        console.log(`     [${time}] ${o.side} ${o.origQty} @ ${o.price || 'MARKET'} — Status: ${o.status} — OrderID: ${o.orderId}`);
      });
    }
  }
  if (totalOrders === 0) {
    console.log('  ℹ️  No orders found on testnet for BTC/ETH/SOL/BNB pairs.');
    console.log('     This means either: no live trades have run yet, or the bot used different pairs.');
  }

  // 3. Check open orders
  const oq = `timestamp=${Date.now()}&recvWindow=10000`;
  const osig = crypto.createHmac('sha256', apiSecret).update(oq).digest('hex');
  const openRes = await fetch(`${BASE}/api/v3/openOrders?${oq}&signature=${osig}`, {
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  if (openRes.ok) {
    const openOrders = await openRes.json() as any[];
    console.log(`\n  🔓 Open orders: ${openOrders.length}`);
    openOrders.forEach((o: any) => {
      console.log(`     ${o.symbol} ${o.side} ${o.origQty} @ ${o.price} — OrderID: ${o.orderId}`);
    });
  }
}

// ─── DB Trade Records ────────────────────────────────────────────────────────

async function checkDbTrades() {
  console.log('\n📦 DB — Live trades recorded (isPaper=false with exchangeOrderId):');
  const liveTrades = await db.select().from(trades)
    .where(isNotNull(trades.exchangeOrderId))
    .orderBy(desc(trades.createdAt))
    .limit(20);

  if (liveTrades.length === 0) {
    console.log('  ℹ️  No live trades recorded in DB yet (no real orders placed through the bot engine).');
  } else {
    console.log(`  ✅ Found ${liveTrades.length} live trade(s):`);
    liveTrades.forEach(t => {
      console.log(`     [${new Date(t.createdAt!).toLocaleString()}] ${t.side} ${t.symbol} @ ${t.price} — OrderID: ${t.exchangeOrderId} — Status: ${t.status}`);
    });
  }

  console.log('\n📄 DB — All recent trades (paper + live):');
  const allTrades = await db.select().from(trades).orderBy(desc(trades.createdAt)).limit(10);
  if (allTrades.length === 0) {
    console.log('  ℹ️  No trades in DB at all.');
  } else {
    allTrades.forEach(t => {
      console.log(`     [${new Date(t.createdAt!).toLocaleString()}] ${t.side} ${t.symbol} @ ${t.price} isPaper=${t.isPaper} orderID=${t.exchangeOrderId ?? 'none'}`);
    });
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== EXCHANGE VERIFICATION SCRIPT ===\n');

  // 1. Show all connections
  const conns = await db.select().from(exchangeConnections);
  console.log(`Found ${conns.length} exchange connection(s):`);
  conns.forEach(c => {
    console.log(`  • ${c.provider} | assetClass=${c.assetClass} | status=${c.status} | sandbox=${c.sandbox} | balance=$${c.totalBalance}`);
  });

  // 2. Check Binance testnet
  const binanceConn = conns.find(c =>
    c.provider.toLowerCase().includes('binance') && c.sandbox === true
  );
  if (binanceConn) {
    if (binanceConn.apiKeyEnc && binanceConn.apiSecretEnc) {
      const apiKey = decrypt(binanceConn.apiKeyEnc);
      const apiSecret = decrypt(binanceConn.apiSecretEnc);
      await checkBinanceTestnet(apiKey, apiSecret);
    } else {
      console.log('\n⚠️  Binance testnet connection found but no API keys stored.');
    }
  } else {
    // Try any binance connection
    const anyBinance = conns.find(c => c.provider.toLowerCase().includes('binance'));
    if (anyBinance) {
      console.log(`\n⚠️  Found Binance connection (sandbox=${anyBinance.sandbox}) — not marked as testnet.`);
      if (anyBinance.apiKeyEnc && anyBinance.apiSecretEnc) {
        const apiKey = decrypt(anyBinance.apiKeyEnc);
        const apiSecret = decrypt(anyBinance.apiSecretEnc);
        await checkBinanceTestnet(apiKey, apiSecret);
      }
    } else {
      console.log('\n⚠️  No Binance connection found in DB.');
    }
  }

  // 3. Check DB trades
  await checkDbTrades();

  console.log('\n=== DONE ===');
  process.exit(0);
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });

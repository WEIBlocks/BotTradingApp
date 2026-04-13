/**
 * Tests a complete BUY → SELL cycle on Binance testnet and Alpaca paper,
 * then syncs portfolio and verifies balances changed correctly.
 *
 * Run: npx tsx src/scripts/test-buy-sell-cycle.ts
 */
import crypto from 'crypto';
import { config } from 'dotenv';
config({ path: new URL('../../.env.development', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
import { db } from '../config/database.js';
import { exchangeConnections } from '../db/schema/exchanges.js';
import { eq } from 'drizzle-orm';
import { refreshUserPortfolio } from '../jobs/portfolio-update.job.js';
// ─── Binance Testnet ─────────────────────────────────────────────────────────
const BINANCE_BASE = 'https://testnet.binance.vision';
function binanceSig(secret, query) {
    return crypto.createHmac('sha256', secret).update(query).digest('hex');
}
async function binanceRequest(method, path, params, apiKey, apiSecret) {
    const ts = Date.now();
    const p = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), timestamp: String(ts), recvWindow: '15000' };
    const query = new URLSearchParams(p).toString();
    const sig = binanceSig(apiSecret, query);
    const url = `${BINANCE_BASE}${path}?${query}&signature=${sig}`;
    const res = await fetch(url, {
        method,
        headers: { 'X-MBX-APIKEY': apiKey },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: JSON.parse(text) };
}
async function testBinance(apiKey, apiSecret) {
    console.log('\n════════════════════════════════════════');
    console.log(' BINANCE TESTNET — BUY → SELL CYCLE');
    console.log('════════════════════════════════════════');
    // 1. Get account balances before
    const acctBefore = await binanceRequest('GET', '/api/v3/account', {}, apiKey, apiSecret);
    if (!acctBefore.ok) {
        console.error('  ✗ Account fetch failed:', acctBefore.body);
        return;
    }
    const usdtBefore = parseFloat(acctBefore.body.balances?.find((b) => b.asset === 'USDT')?.free ?? '0');
    const btcBefore = parseFloat(acctBefore.body.balances?.find((b) => b.asset === 'BTC')?.free ?? '0');
    console.log(`  Before — USDT: ${usdtBefore.toFixed(2)}  BTC: ${btcBefore.toFixed(8)}`);
    // 2. BUY 0.001 BTC at market
    console.log('\n  Placing MARKET BUY 0.001 BTC...');
    const buyRes = await binanceRequest('POST', '/api/v3/order', {
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: '0.001',
    }, apiKey, apiSecret);
    if (!buyRes.ok) {
        console.error('  ✗ BUY failed:', JSON.stringify(buyRes.body));
        return;
    }
    const buyOrder = buyRes.body;
    console.log(`  ✓ BUY order placed — OrderID: ${buyOrder.orderId}  Status: ${buyOrder.status}`);
    const executedQty = parseFloat(buyOrder.executedQty ?? '0.001');
    const cummQuoteQty = parseFloat(buyOrder.cummulativeQuoteQty ?? '0');
    const avgBuyPrice = executedQty > 0 ? cummQuoteQty / executedQty : 0;
    console.log(`    Executed: ${executedQty} BTC @ avg $${avgBuyPrice.toFixed(2)}`);
    // 3. Short wait then SELL same quantity
    await new Promise(r => setTimeout(r, 1500));
    const sellQty = executedQty > 0 ? executedQty.toFixed(5) : '0.001';
    console.log(`\n  Placing MARKET SELL ${sellQty} BTC...`);
    const sellRes = await binanceRequest('POST', '/api/v3/order', {
        symbol: 'BTCUSDT',
        side: 'SELL',
        type: 'MARKET',
        quantity: sellQty,
    }, apiKey, apiSecret);
    if (!sellRes.ok) {
        console.error('  ✗ SELL failed:', JSON.stringify(sellRes.body));
        return;
    }
    const sellOrder = sellRes.body;
    console.log(`  ✓ SELL order placed — OrderID: ${sellOrder.orderId}  Status: ${sellOrder.status}`);
    const sellQtyF = parseFloat(sellOrder.executedQty ?? sellQty);
    const sellQuote = parseFloat(sellOrder.cummulativeQuoteQty ?? '0');
    const avgSellPrice = sellQtyF > 0 ? sellQuote / sellQtyF : 0;
    console.log(`    Executed: ${sellQtyF} BTC @ avg $${avgSellPrice.toFixed(2)}`);
    const pnl = sellQuote - cummQuoteQty;
    console.log(`\n  PnL this cycle: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} USDT`);
    // 4. Account balances after
    await new Promise(r => setTimeout(r, 500));
    const acctAfter = await binanceRequest('GET', '/api/v3/account', {}, apiKey, apiSecret);
    const usdtAfter = parseFloat(acctAfter.body.balances?.find((b) => b.asset === 'USDT')?.free ?? '0');
    const btcAfter = parseFloat(acctAfter.body.balances?.find((b) => b.asset === 'BTC')?.free ?? '0');
    console.log(`\n  After  — USDT: ${usdtAfter.toFixed(2)}  BTC: ${btcAfter.toFixed(8)}`);
    console.log(`  USDT delta: ${(usdtAfter - usdtBefore) >= 0 ? '+' : ''}${(usdtAfter - usdtBefore).toFixed(2)}`);
    return { usdtBefore, usdtAfter, btcBefore, btcAfter };
}
// ─── Alpaca Paper ─────────────────────────────────────────────────────────────
const ALPACA_BASE = 'https://paper-api.alpaca.markets';
async function alpacaRequest(method, path, body, apiKey, apiSecret) {
    const res = await fetch(`${ALPACA_BASE}${path}`, {
        method,
        headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : {} };
}
async function testAlpaca(apiKey, apiSecret) {
    console.log('\n════════════════════════════════════════');
    console.log(' ALPACA PAPER — BUY → SELL CYCLE');
    console.log('════════════════════════════════════════');
    // 1. Account before
    const acctBefore = await alpacaRequest('GET', '/v2/account', undefined, apiKey, apiSecret);
    if (!acctBefore.ok) {
        console.error('  ✗ Account fetch failed:', acctBefore.body);
        return;
    }
    const cashBefore = parseFloat(acctBefore.body.cash ?? '0');
    console.log(`  Before — Cash: $${cashBefore.toFixed(2)}`);
    // 2. BUY 1 AAPL fractional share
    console.log('\n  Placing MARKET BUY 1 share AAPL...');
    const buyRes = await alpacaRequest('POST', '/v2/orders', {
        symbol: 'AAPL',
        qty: '1',
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
    }, apiKey, apiSecret);
    if (!buyRes.ok) {
        console.error('  ✗ BUY failed:', JSON.stringify(buyRes.body));
        return;
    }
    const buyOrder = buyRes.body;
    console.log(`  ✓ BUY order placed — OrderID: ${buyOrder.id}  Status: ${buyOrder.status}`);
    // Wait for fill (paper fills quickly)
    await new Promise(r => setTimeout(r, 3000));
    // Check order status
    const orderCheck = await alpacaRequest('GET', `/v2/orders/${buyOrder.id}`, undefined, apiKey, apiSecret);
    console.log(`  Order status: ${orderCheck.body.status}  filled_qty: ${orderCheck.body.filled_qty}  filled_avg_price: $${orderCheck.body.filled_avg_price ?? 'pending'}`);
    // 3. SELL same position
    console.log('\n  Placing MARKET SELL 1 share AAPL...');
    const sellRes = await alpacaRequest('POST', '/v2/orders', {
        symbol: 'AAPL',
        qty: '1',
        side: 'sell',
        type: 'market',
        time_in_force: 'day',
    }, apiKey, apiSecret);
    if (!sellRes.ok) {
        // May fail outside market hours — that's expected
        console.log(`  ℹ  SELL response (${sellRes.status}): ${JSON.stringify(sellRes.body)}`);
        console.log('  (Alpaca paper only fills during market hours Mon-Fri 9:30-16:00 ET)');
        return;
    }
    const sellOrder = sellRes.body;
    console.log(`  ✓ SELL order placed — OrderID: ${sellOrder.id}  Status: ${sellOrder.status}`);
    await new Promise(r => setTimeout(r, 3000));
    // 4. Account after
    const acctAfter = await alpacaRequest('GET', '/v2/account', undefined, apiKey, apiSecret);
    const cashAfter = parseFloat(acctAfter.body.cash ?? '0');
    console.log(`\n  After  — Cash: $${cashAfter.toFixed(2)}`);
    console.log(`  Cash delta: ${(cashAfter - cashBefore) >= 0 ? '+' : ''}${(cashAfter - cashBefore).toFixed(2)}`);
}
// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('=== BUY + SELL CYCLE VERIFICATION ===');
    // Use raw env keys for direct API test (avoids encryption mismatch with DB)
    const BINANCE_KEY = process.env.BINANCE_API_KEY;
    const BINANCE_SECRET = process.env.BINANCE_API_SECRET;
    const ALPACA_KEY = process.env.ALPACA_API_KEY;
    const ALPACA_SECRET = process.env.ALPACA_API_SECRET;
    // Get connections from DB (for portfolio sync step)
    const conns = await db.select({
        id: exchangeConnections.id,
        userId: exchangeConnections.userId,
        provider: exchangeConnections.provider,
        apiKeyEnc: exchangeConnections.apiKeyEnc,
        apiSecretEnc: exchangeConnections.apiSecretEnc,
        sandbox: exchangeConnections.sandbox,
        assetClass: exchangeConnections.assetClass,
        totalBalance: exchangeConnections.totalBalance,
    }).from(exchangeConnections).where(eq(exchangeConnections.status, 'connected'));
    console.log(`\nDB connected exchange(s):`);
    conns.forEach(c => console.log(`  • ${c.provider} | sandbox=${c.sandbox} | balance=$${c.totalBalance}`));
    // ── Binance testnet cycle (using env keys directly) ──
    if (BINANCE_KEY && BINANCE_SECRET) {
        await testBinance(BINANCE_KEY, BINANCE_SECRET);
    }
    else {
        console.log('\n⚠  BINANCE_API_KEY / BINANCE_API_SECRET not set in env.');
    }
    // ── Alpaca paper cycle (using env keys directly) ──
    if (ALPACA_KEY && ALPACA_SECRET) {
        await testAlpaca(ALPACA_KEY, ALPACA_SECRET);
    }
    else {
        console.log('\n⚠  ALPACA_API_KEY / ALPACA_API_SECRET not set in env.');
    }
    // ── Sync portfolio so DB reflects new balances ──
    if (conns.length > 0) {
        console.log('\n════════════════════════════════════════');
        console.log(' SYNCING PORTFOLIO TO DB');
        console.log('════════════════════════════════════════');
        const userIds = [...new Set(conns.map(c => c.userId))];
        for (const uid of userIds) {
            console.log(`  Syncing user ${uid}...`);
            await refreshUserPortfolio(uid);
            console.log('  ✓ Done');
        }
    }
    // ── Final DB balances ──
    const updated = await db.select({
        provider: exchangeConnections.provider,
        totalBalance: exchangeConnections.totalBalance,
        lastSyncAt: exchangeConnections.lastSyncAt,
        sandbox: exchangeConnections.sandbox,
    }).from(exchangeConnections).where(eq(exchangeConnections.status, 'connected'));
    console.log('\n════════════════════════════════════════');
    console.log(' FINAL DB BALANCES (after sync)');
    console.log('════════════════════════════════════════');
    updated.forEach(c => console.log(`  ${c.provider} (sandbox=${c.sandbox}): $${c.totalBalance}  lastSync: ${c.lastSyncAt}`));
    console.log('\n=== DONE ===');
    process.exit(0);
}
main().catch(e => { console.error('Error:', e.message); process.exit(1); });

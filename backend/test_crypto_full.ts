/**
 * Full crypto flow test against production server (post-redeploy)
 */
import { readFileSync } from 'fs';
import ccxt from 'ccxt';

const env = readFileSync('D:/Weiblocks/Bot_App/backend/.env.development', 'utf8');
const get = (key: string) => (env.match(new RegExp(`^${key}=(.+)$`, 'm')) ?? [])[1]?.trim() ?? '';

const BACKEND        = 'http://206.81.2.59';
const EMAIL          = 'user@bottrade.com';
const PASSWORD       = 'Password123!';
const BINANCE_KEY    = get('BINANCE_API_KEY');
const BINANCE_SECRET = get('BINANCE_API_SECRET');
const IS_TESTNET     = get('BINANCE_TESTNET') === 'true';

let pass = 0, fail = 0;
const ok = (label: string, detail = '') => { pass++; console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`); };
const ko = (label: string, detail = '') => { fail++; console.error(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); };

async function req<T = any>(method: string, path: string, body?: any, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BACKEND}${path}`, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.error ?? json?.message ?? JSON.stringify(json).slice(0, 300);
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return json;
}

console.log(`\n═══════════════════════════════════════════════`);
console.log(` Post-Deploy Crypto Flow Test — ${BACKEND}`);
console.log(` Binance: ${IS_TESTNET ? 'TESTNET' : 'LIVE'}`);
console.log(`═══════════════════════════════════════════════\n`);

// ── 1. Login ───────────────────────────────────────────────────────────────────
console.log('① Login');
let token = '';
try {
  const r = await req('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  token = r.accessToken ?? r.data?.accessToken ?? '';
  if (!token) throw new Error('No token');
  ok('Login');
} catch (e: any) { ko('Login', e.message); process.exit(1); }

// ── 2. List existing connections ───────────────────────────────────────────────
console.log('\n② Existing exchange connections');
let connId = '';
let conns: any[] = [];
try {
  const r = await req('GET', '/exchange/user/connections', undefined, token);
  conns = r.data ?? [];
  ok(`Connections fetched`, `${conns.length} total`);
  for (const c of conns) {
    console.log(`     ${c.provider} | sandbox:${c.sandbox} | status:${c.status} | $${c.totalBalance ?? '?'} | id:${c.id?.slice(0,8)}`);
  }
} catch (e: any) { ko('List connections', e.message); }

// Clean up any broken Binance connections
const broken = conns.filter(c => c.provider.toLowerCase() === 'binance' && c.status === 'error');
for (const b of broken) {
  try {
    await req('POST', `/exchange/${b.id}/disconnect`, {}, token);
    console.log(`  Cleaned up broken connection ${b.id.slice(0,8)}`);
  } catch {}
}

// ── 3. test-connection (credentials only, no save) ─────────────────────────────
console.log('\n③ POST /exchange/test-connection');
try {
  const r = await req('POST', '/exchange/test-connection', {
    provider: 'Binance', apiKey: BINANCE_KEY, apiSecret: BINANCE_SECRET, sandbox: IS_TESTNET,
  }, token);
  ok('test-connection', r.data?.message ?? 'success');
} catch (e: any) { ko('test-connection', e.message); }

// ── 4. Connect (save credentials) ─────────────────────────────────────────────
console.log('\n④ POST /exchange/connect');
const existing = conns.find(c =>
  c.provider.toLowerCase() === 'binance' && !!c.sandbox === IS_TESTNET && c.status === 'connected'
);
if (existing) {
  connId = existing.id;
  console.log(`  Already connected — using ${connId.slice(0,8)}`);
  ok('connect (existing)', connId.slice(0,8));
} else {
  try {
    const r = await req('POST', '/exchange/connect', {
      provider: 'Binance', apiKey: BINANCE_KEY, apiSecret: BINANCE_SECRET, sandbox: IS_TESTNET,
    }, token);
    connId = r.data?.id ?? '';
    ok('connect (new)', `id:${connId.slice(0,8)} status:${r.data?.status}`);
  } catch (e: any) { ko('connect', e.message); }
}

// ── 5. Resync balance ──────────────────────────────────────────────────────────
console.log('\n⑤ POST /exchange/:id/resync');
if (connId) {
  try {
    const r = await req('POST', `/exchange/${connId}/resync`, {}, token);
    const d = r.data;
    if (d?.status === 'connected') {
      ok('resync', `balance:$${d.totalBalance} status:${d.status}`);
    } else {
      ko('resync', `status:${d?.status} — ${d?.errorMessage ?? 'unknown'}`);
    }
  } catch (e: any) { ko('resync', e.message); }
} else {
  ko('resync', 'skipped — no connId');
}

// ── 6. Read connections after resync ──────────────────────────────────────────
console.log('\n⑥ GET /exchange/user/connections (after resync)');
try {
  const r = await req('GET', '/exchange/user/connections', undefined, token);
  const updated: any[] = r.data ?? [];
  const binance = updated.find(c => c.id === connId);
  if (binance) {
    ok('Connection updated', `balance:$${binance.totalBalance} status:${binance.status} lastSync:${binance.lastSyncAt?.slice(11,19)}`);
  } else {
    ko('Connection not found after resync');
  }
} catch (e: any) { ko('Connections after resync', e.message); }

// ── 7. Direct ccxt adapter — all methods ──────────────────────────────────────
console.log('\n⑦ Direct ccxt adapter (loadMarkets → fetchBalance → fetchTicker)');
const exchange = new (ccxt as any).binance({
  apiKey: BINANCE_KEY, secret: BINANCE_SECRET, enableRateLimit: true,
  ...(IS_TESTNET ? { sandbox: true } : {}),
}) as any;
if (IS_TESTNET) exchange.setSandboxMode(true);

let usdtFree = 0, btcPrice = 0;
try {
  await exchange.loadMarkets();
  ok('loadMarkets', `${exchange.symbols.length} symbols`);
} catch (e: any) { ko('loadMarkets', e.message); }

try {
  const bal = await exchange.fetchBalance();
  usdtFree = bal.free?.USDT ?? 0;
  ok('fetchBalance', `USDT:$${usdtFree.toFixed(2)} BTC:${bal.free?.BTC ?? 0}`);
} catch (e: any) { ko('fetchBalance', e.message); }

try {
  const t = await exchange.fetchTicker('BTC/USDT');
  btcPrice = t.last ?? 0;
  ok('fetchTicker BTC/USDT', `$${btcPrice.toFixed(2)}`);
} catch (e: any) { ko('fetchTicker BTC/USDT', e.message); }

try {
  const t = await exchange.fetchTicker('ETH/USDT');
  ok('fetchTicker ETH/USDT', `$${(t.last ?? 0).toFixed(2)}`);
} catch (e: any) { ko('fetchTicker ETH/USDT', e.message); }

try {
  const t = await exchange.fetchTicker('SOL/USDT');
  ok('fetchTicker SOL/USDT', `$${(t.last ?? 0).toFixed(2)}`);
} catch (e: any) { ko('fetchTicker SOL/USDT', e.message); }

// ── 8. KuCoin batch tickers (portfolio job path) ───────────────────────────────
console.log('\n⑧ KuCoin batch tickers (portfolio-update / resync job path)');
try {
  const kucoin = new (ccxt as any).kucoin({ enableRateLimit: true }) as any;
  await kucoin.loadMarkets();
  const syms = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT'];
  const tickers = await kucoin.fetchTickers(syms.filter(s => kucoin.markets[s]));
  let allOk = true;
  for (const [sym, t] of Object.entries(tickers) as [string, any][]) {
    if (!t?.last) { allOk = false; ko(`KuCoin ${sym}`, 'no price'); }
  }
  if (allOk) ok('KuCoin batch tickers', `BTC:$${(tickers['BTC/USDT'] as any)?.last?.toFixed(0)} ETH:$${(tickers['ETH/USDT'] as any)?.last?.toFixed(0)} SOL:$${(tickers['SOL/USDT'] as any)?.last?.toFixed(0)}`);
} catch (e: any) { ko('KuCoin batch tickers', e.message); }

// ── 9. BUY order ───────────────────────────────────────────────────────────────
console.log('\n⑨ createOrder BUY (market, BTC/USDT ~$11)');
let buyOk = false;
if (usdtFree >= 11 && btcPrice > 0) {
  try {
    const amt = parseFloat(exchange.amountToPrecision('BTC/USDT', 11 / btcPrice));
    const order = await exchange.createOrder('BTC/USDT', 'market', 'buy', amt);
    ok('BUY', `id:${order.id} filled:${order.filled} avg:$${order.average?.toFixed(2) ?? order.price}`);
    buyOk = true;
  } catch (e: any) { ko('BUY', e.message); }
} else {
  ko('BUY', `insufficient balance USDT:$${usdtFree} price:$${btcPrice}`);
}

// ── 10. SELL order ─────────────────────────────────────────────────────────────
console.log('\n⑩ createOrder SELL (market, all BTC)');
if (buyOk) {
  try {
    const bal2 = await exchange.fetchBalance();
    const btcNow = bal2.free?.BTC ?? 0;
    if (btcNow > 0) {
      const sellAmt = parseFloat(exchange.amountToPrecision('BTC/USDT', btcNow));
      const sell = await exchange.createOrder('BTC/USDT', 'market', 'sell', sellAmt);
      ok('SELL', `id:${sell.id} filled:${sell.filled} avg:$${sell.average?.toFixed(2) ?? sell.price}`);
    } else {
      ko('SELL', 'no BTC balance after buy');
    }
  } catch (e: any) { ko('SELL', e.message); }
} else {
  console.log('  ⚪ Skipped — BUY did not succeed');
}

// ── 11. amountToPrecision for common pairs ─────────────────────────────────────
console.log('\n⑪ amountToPrecision (lot-size rounding for common pairs)');
for (const [sym, rawAmt] of [['BTC/USDT', 0.000147], ['ETH/USDT', 0.005321], ['SOL/USDT', 0.1234]] as [string, number][]) {
  try {
    if (!exchange.markets[sym]) { console.log(`  ⚪ ${sym} not in markets`); continue; }
    const rounded = exchange.amountToPrecision(sym, rawAmt);
    ok(`amountToPrecision ${sym}`, `${rawAmt} → ${rounded}`);
  } catch (e: any) { ko(`amountToPrecision ${sym}`, e.message); }
}

// ── 12. ETH/USDT BUY + SELL (second pair) ─────────────────────────────────────
console.log('\n⑫ ETH/USDT BUY + SELL');
if (usdtFree >= 22 && btcPrice > 0) { // need extra USDT
  try {
    const ethTicker = await exchange.fetchTicker('ETH/USDT');
    const ethPrice = ethTicker.last ?? 0;
    const ethAmt = parseFloat(exchange.amountToPrecision('ETH/USDT', 11 / ethPrice));
    const ethBuy = await exchange.createOrder('ETH/USDT', 'market', 'buy', ethAmt);
    ok('ETH BUY', `id:${ethBuy.id} filled:${ethBuy.filled} avg:$${ethBuy.average?.toFixed(2)}`);

    const bal3 = await exchange.fetchBalance();
    const ethNow = bal3.free?.ETH ?? 0;
    if (ethNow > 0) {
      const ethSellAmt = parseFloat(exchange.amountToPrecision('ETH/USDT', ethNow));
      const ethSell = await exchange.createOrder('ETH/USDT', 'market', 'sell', ethSellAmt);
      ok('ETH SELL', `id:${ethSell.id} filled:${ethSell.filled}`);
    }
  } catch (e: any) { ko('ETH BUY/SELL', e.message); }
} else {
  console.log(`  ⚪ Skipped ETH trades — USDT:$${usdtFree}`);
}

// ── 13. Final balance ──────────────────────────────────────────────────────────
console.log('\n⑬ Final balance');
try {
  const balF = await exchange.fetchBalance();
  ok('Final balance', `USDT:$${(balF.free?.USDT ?? 0).toFixed(2)} BTC:${balF.free?.BTC ?? 0} ETH:${balF.free?.ETH ?? 0}`);
} catch (e: any) { ko('Final balance', e.message); }

// ── Summary ────────────────────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════════`);
console.log(` Results: ${pass} passed  ${fail} failed`);
if (fail === 0) console.log(' 🟢 All checks passed — crypto flows working');
else console.log(` 🔴 ${fail} check(s) need attention`);
console.log(`═══════════════════════════════════════════════\n`);
if (fail > 0) process.exit(1);

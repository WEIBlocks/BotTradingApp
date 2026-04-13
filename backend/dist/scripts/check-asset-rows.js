/**
 * Dumps all exchange_assets rows to diagnose duplicate or inflating balances.
 */
import { db } from '../config/database.js';
import { exchangeAssets, exchangeConnections } from '../db/schema/exchanges.js';
import { eq } from 'drizzle-orm';
async function main() {
    const rows = await db.select({
        connId: exchangeAssets.exchangeConnId,
        symbol: exchangeAssets.symbol,
        amount: exchangeAssets.amount,
        valueUsd: exchangeAssets.valueUsd,
        change24h: exchangeAssets.change24h,
        allocation: exchangeAssets.allocation,
        provider: exchangeConnections.provider,
        sandbox: exchangeConnections.sandbox,
        connBalance: exchangeConnections.totalBalance,
        updatedAt: exchangeAssets.updatedAt,
    }).from(exchangeAssets)
        .innerJoin(exchangeConnections, eq(exchangeAssets.exchangeConnId, exchangeConnections.id));
    // Group by connection
    const byConn = new Map();
    for (const r of rows) {
        const key = `${r.provider}(sandbox=${r.sandbox}) connBalance=$${r.connBalance}`;
        if (!byConn.has(key))
            byConn.set(key, []);
        byConn.get(key).push(r);
    }
    for (const [conn, assets] of byConn.entries()) {
        console.log(`\n── ${conn} ──`);
        let sum = 0;
        for (const a of assets) {
            const v = parseFloat(a.valueUsd ?? '0');
            sum += v;
            console.log(`  ${a.symbol.padEnd(6)} amount=${parseFloat(a.amount).toFixed(6).padStart(12)}  valueUsd=$${v.toFixed(2).padStart(10)}  alloc=${a.allocation ?? '?'}%  updated=${a.updatedAt}`);
        }
        console.log(`  ── TOTAL from assets: $${sum.toFixed(2)}`);
    }
    // Check for duplicates
    console.log('\n── DUPLICATE SYMBOL CHECK ──');
    const seen = new Map();
    for (const r of rows) {
        const key = `${r.connId}:${r.symbol}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dups = [...seen.entries()].filter(([, c]) => c > 1);
    if (dups.length === 0) {
        console.log('  No duplicates found.');
    }
    else {
        for (const [key, count] of dups) {
            console.log(`  !! DUPLICATE: ${key} appears ${count} times`);
        }
    }
    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

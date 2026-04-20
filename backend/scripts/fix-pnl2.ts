/**
 * Clean up all corrupted paper/shadow trade data:
 * - total_value in billions = old uncapped seed data, delete entirely
 * - pnl on BUY trades = null (no realised PnL on entry)
 * - pnl on SELL where |pnl| > total_value * 0.5 = corrupted, null it
 */
import { db } from '../src/config/database.js';
import { sql } from 'drizzle-orm';

async function main() {
  // 1. Delete paper trades with absurd total_value (seed data with no balance cap)
  const del = await (db as any).execute(sql`
    DELETE FROM trades
    WHERE is_paper = true AND total_value::numeric > 10000
  `);
  console.log(`Deleted absurd paper trades (tv > $10k): ${del.rowCount ?? 'done'}`);

  // 2. Null pnl on BUY trades (no realised pnl on entry)
  const buyFix = await (db as any).execute(sql`
    UPDATE trades SET pnl = NULL, pnl_percent = NULL
    WHERE side = 'BUY' AND pnl IS NOT NULL
  `);
  console.log(`Cleared pnl on BUY trades: ${buyFix.rowCount ?? 'done'}`);

  // 3. Null pnl on SELL trades where |pnl| > 50% of total_value (corrupted)
  const sellFix = await (db as any).execute(sql`
    UPDATE trades SET pnl = NULL, pnl_percent = NULL
    WHERE side = 'SELL'
      AND pnl IS NOT NULL
      AND total_value IS NOT NULL
      AND total_value::numeric > 0
      AND ABS(pnl::numeric) > ABS(total_value::numeric) * 0.5
  `);
  console.log(`Cleared corrupted SELL pnl (>50% of tv): ${sellFix.rowCount ?? 'done'}`);

  // Summary
  const summary = await (db as any).execute(sql`
    SELECT side, is_paper,
      COUNT(*)::int as total,
      SUM(CASE WHEN pnl IS NOT NULL THEN 1 ELSE 0 END)::int as with_pnl,
      ROUND(SUM(COALESCE(pnl::numeric,0)),2) as pnl_sum,
      SUM(CASE WHEN pnl::numeric > 0 THEN 1 ELSE 0 END)::int as wins,
      SUM(CASE WHEN pnl::numeric < 0 THEN 1 ELSE 0 END)::int as losses
    FROM trades
    GROUP BY side, is_paper
    ORDER BY is_paper, side
  `);
  console.log('\n=== Final summary ===');
  summary.forEach((r: any) =>
    console.log(` ${r.side} paper=${r.is_paper}: ${r.total} trades | with_pnl=${r.with_pnl} | sum=$${r.pnl_sum} | W=${r.wins} L=${r.losses}`)
  );

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

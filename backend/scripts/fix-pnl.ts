/**
 * Fix corrupted PnL data in trades table:
 * 1. SELL trades where pnl ≈ total_value (full proceeds stored as profit) — set to NULL
 *    so the UI shows them as unknown rather than wildly wrong
 * 2. BUY trades with non-null pnl — set to NULL (BUYs have no realised PnL)
 */
import { db } from '../src/config/database.js';
import { sql } from 'drizzle-orm';

async function main() {
  // Fix BUY trades: clear any pnl stored on open positions
  const buyFix = await (db as any).execute(sql`
    UPDATE trades
    SET pnl = NULL, pnl_percent = NULL
    WHERE side = 'BUY' AND is_paper = true AND pnl IS NOT NULL
  `);
  console.log(`Fixed BUY trades with pnl: ${buyFix.rowCount ?? buyFix.count ?? 'done'}`);

  // Fix SELL trades where pnl is clearly wrong:
  // "pnl ≈ total_value" means they stored gross proceeds as profit.
  // A realistic trade profit is max ~20% of position value.
  // If pnl > total_value * 0.25, it's definitely corrupted — clear it.
  const sellFix = await (db as any).execute(sql`
    UPDATE trades
    SET pnl = NULL, pnl_percent = NULL
    WHERE side = 'SELL'
      AND is_paper = true
      AND pnl IS NOT NULL
      AND total_value IS NOT NULL
      AND ABS(pnl::numeric) > ABS(total_value::numeric) * 0.25
  `);
  console.log(`Fixed corrupted SELL trades: ${sellFix.rowCount ?? sellFix.count ?? 'done'}`);

  // Show corrected totals
  const summary = await (db as any).execute(sql`
    SELECT
      side,
      COUNT(*)::int as total,
      SUM(CASE WHEN pnl IS NOT NULL THEN 1 ELSE 0 END)::int as with_pnl,
      ROUND(SUM(COALESCE(pnl::numeric, 0)), 2) as pnl_sum,
      SUM(CASE WHEN pnl::numeric > 0 THEN 1 ELSE 0 END)::int as wins,
      SUM(CASE WHEN pnl::numeric < 0 THEN 1 ELSE 0 END)::int as losses
    FROM trades
    WHERE is_paper = true
    GROUP BY side
  `);
  console.log('\n=== Corrected summary ===');
  summary.forEach((r: any) => {
    console.log(` ${r.side}: ${r.total} trades | with_pnl=${r.with_pnl} | pnl_sum=$${r.pnl_sum} | wins=${r.wins} losses=${r.losses}`);
  });

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

import { db } from '../src/config/database.js';
import { sql } from 'drizzle-orm';

async function main() {
  const dist = await (db as any).execute(sql`
    SELECT
      CASE
        WHEN ABS(pnl::numeric) < 1 THEN 'tiny (<$1)'
        WHEN ABS(pnl::numeric) < 10 THEN 'small ($1-10)'
        WHEN ABS(pnl::numeric) < 100 THEN 'medium ($10-100)'
        WHEN ABS(pnl::numeric) < 1000 THEN 'large ($100-1k)'
        ELSE 'huge (>$1k)'
      END as bucket,
      COUNT(*)::int as cnt,
      ROUND(SUM(pnl::numeric),2) as pnl_sum
    FROM trades WHERE side = 'SELL' AND pnl IS NOT NULL
    GROUP BY 1 ORDER BY cnt DESC
  `);
  console.log('PnL distribution for all SELL trades:');
  dist.forEach((r: any) => console.log(` ${r.bucket}: ${r.cnt} trades, sum=$${r.pnl_sum}`));

  const worst = await (db as any).execute(sql`
    SELECT symbol, ROUND(pnl::numeric,2) as pnl, ROUND(total_value::numeric,2) as tv, is_paper
    FROM trades WHERE side = 'SELL' AND pnl IS NOT NULL AND ABS(pnl::numeric) > 1000
    ORDER BY pnl::numeric ASC LIMIT 10
  `);
  console.log('\nWorst outliers (|pnl| > $1000):');
  worst.forEach((r: any) => console.log(` ${r.symbol} pnl=$${r.pnl} tv=$${r.tv} paper=${r.is_paper}`));

  // Are these live (is_paper=false) trades from seed?
  const liveCheck = await (db as any).execute(sql`
    SELECT is_paper, COUNT(*)::int as cnt, ROUND(SUM(pnl::numeric),2) as sum
    FROM trades WHERE side = 'SELL' AND pnl IS NOT NULL
    GROUP BY is_paper
  `);
  console.log('\nBy is_paper:');
  liveCheck.forEach((r: any) => console.log(` paper=${r.is_paper}: ${r.cnt} trades sum=$${r.sum}`));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

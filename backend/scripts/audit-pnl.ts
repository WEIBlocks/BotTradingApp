import { db } from '../src/config/database.js';
import { sql } from 'drizzle-orm';

async function main() {
  const rows = await (db as any).execute(sql`SELECT id FROM users WHERE email = 'farooqtariq400@gmail.com' LIMIT 1`);
  const uid = rows[0].id;

  const breakdown = await (db as any).execute(sql`
    SELECT side, is_paper, shadow_session_id IS NOT NULL as is_shadow,
      COUNT(*)::int as cnt,
      ROUND(SUM(pnl)::numeric, 2) as pnl_sum
    FROM trades WHERE user_id = ${uid}::uuid
    GROUP BY side, is_paper, is_shadow ORDER BY is_shadow, side
  `);
  console.log('=== Trade breakdown ===');
  breakdown.forEach((r: any) => console.log(` side=${r.side} paper=${r.is_paper} shadow=${r.is_shadow} cnt=${r.cnt} pnl=$${r.pnl_sum}`));

  const pnl = await (db as any).execute(sql`
    SELECT COUNT(*)::int as total,
      SUM(CASE WHEN pnl IS NOT NULL THEN 1 ELSE 0 END)::int as with_pnl,
      ROUND(SUM(pnl)::numeric,2) as total_pnl,
      SUM(CASE WHEN pnl::numeric > 0 THEN 1 ELSE 0 END)::int as wins,
      SUM(CASE WHEN pnl::numeric < 0 THEN 1 ELSE 0 END)::int as losses,
      ROUND(MAX(pnl::numeric),4) as best,
      ROUND(MIN(pnl::numeric),4) as worst
    FROM trades WHERE user_id = ${uid}::uuid AND is_paper = true
  `);
  const p = pnl[0];
  console.log('\n=== Shadow/Paper PnL ===');
  console.log(` Total: ${p.total}, With PnL field: ${p.with_pnl}, Wins: ${p.wins}, Losses: ${p.losses}`);
  console.log(` Total PnL: $${p.total_pnl}, Best: $${p.best}, Worst: $${p.worst}`);

  const top = await (db as any).execute(sql`
    SELECT symbol, side, ROUND(pnl::numeric,4) as pnl,
      ROUND(total_value::numeric,4) as total_value,
      ROUND(price::numeric,2) as price
    FROM trades WHERE user_id = ${uid}::uuid AND is_paper = true AND pnl IS NOT NULL
    ORDER BY ABS(pnl::numeric) DESC LIMIT 15
  `);
  console.log('\n=== Top PnL trades (by abs value) ===');
  top.forEach((r: any) => console.log(` ${r.symbol} ${r.side} pnl=$${r.pnl} total=$${r.total_value} price=$${r.price}`));

  // BUY trades that have PnL (shouldn't normally)
  const buyWithPnl = await (db as any).execute(sql`
    SELECT COUNT(*)::int as cnt, ROUND(SUM(pnl::numeric),2) as pnl_sum
    FROM trades WHERE user_id = ${uid}::uuid AND is_paper = true
      AND side = 'BUY' AND pnl IS NOT NULL AND pnl::numeric != 0
  `);
  console.log(`\n=== BUY trades with non-zero PnL (should be 0 ideally) ===`);
  console.log(` Count: ${buyWithPnl[0].cnt}, Sum: $${buyWithPnl[0].pnl_sum}`);

  // SELL trades PnL only
  const sellPnl = await (db as any).execute(sql`
    SELECT COUNT(*)::int as cnt, ROUND(SUM(pnl::numeric),2) as pnl_sum,
      SUM(CASE WHEN pnl::numeric > 0 THEN 1 ELSE 0 END)::int as wins,
      SUM(CASE WHEN pnl::numeric < 0 THEN 1 ELSE 0 END)::int as losses
    FROM trades WHERE user_id = ${uid}::uuid AND is_paper = true AND side = 'SELL'
  `);
  const s = sellPnl[0];
  console.log(`\n=== SELL trades only ===`);
  console.log(` Count: ${s.cnt}, PnL sum: $${s.pnl_sum}, Wins: ${s.wins}, Losses: ${s.losses}`);

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

import { db } from '../src/config/database.js';
import { sql } from 'drizzle-orm';

async function main() {
  const rows = await (db as any).execute(sql`SELECT id FROM users WHERE email = 'farooqtariq400@gmail.com' LIMIT 1`);
  const uid = rows[0].id;

  // Bot detail page source: bot_positions (closed), grouped by symbol per session
  const positions = await (db as any).execute(sql`
    SELECT p.symbol,
      p.entry_price, p.exit_price, p.amount,
      p.pnl as pos_pnl, p.pnl_percent as pos_pnl_pct,
      p.shadow_session_id
    FROM bot_positions p
    WHERE p.user_id = ${uid}::uuid AND p.status = 'closed' AND p.is_paper = true
    ORDER BY p.closed_at DESC LIMIT 10
  `);
  console.log('=== bot_positions (what bot detail page shows) ===');
  positions.forEach((r: any) => console.log(
    ` ${r.symbol} buy=$${parseFloat(r.entry_price).toFixed(4)} sell=$${parseFloat(r.exit_price).toFixed(4)} amt=${parseFloat(r.amount).toFixed(4)} | pos_pnl=$${r.pos_pnl} pos_pnl%=${r.pos_pnl_pct}`
  ));

  // Trade history source: trades table, last 20
  const trades = await (db as any).execute(sql`
    SELECT t.symbol, t.side, t.price, t.amount, t.total_value, t.pnl as trade_pnl, t.pnl_percent as trade_pnl_pct
    FROM trades t
    WHERE t.user_id = ${uid}::uuid AND t.is_paper = true
    ORDER BY t.executed_at DESC LIMIT 20
  `);
  console.log('\n=== trades table (what trade history shows) ===');
  trades.forEach((r: any) => console.log(
    ` ${r.symbol} ${r.side} price=$${parseFloat(r.price).toFixed(4)} amt=${parseFloat(r.amount).toFixed(4)} tv=$${parseFloat(r.total_value||0).toFixed(2)} | trade_pnl=$${r.trade_pnl} trade_pnl%=${r.trade_pnl_pct}`
  ));

  // Key mismatch: compare amounts between positions and trades
  // Bot detail shows pnl from position (entry_price, exit_price, position.amount)
  // Trade history shows pnl from trades.pnl column
  // The amounts DIFFER because:
  //   - bot_positions.amount = balance * sizePercent / 100 / price  (engine calculation)
  //   - trades.amount = cappedAmount = min(balance*0.5, positionValue) / price  (shadow job calculation)

  // Check specific mismatch: mSOL trades
  const msol = await (db as any).execute(sql`
    SELECT
      p.entry_price, p.exit_price, p.amount as pos_amount, p.pnl as pos_pnl,
      t_buy.price as buy_price, t_buy.amount as buy_amount, t_buy.total_value as buy_tv,
      t_sell.price as sell_price, t_sell.amount as sell_amount, t_sell.total_value as sell_tv, t_sell.pnl as trade_pnl
    FROM bot_positions p
    LEFT JOIN trades t_sell ON t_sell.user_id = p.user_id
      AND t_sell.symbol = p.symbol AND t_sell.side = 'SELL' AND t_sell.is_paper = true
      AND ABS(t_sell.price::numeric - p.exit_price::numeric) < 0.01
    LEFT JOIN trades t_buy ON t_buy.user_id = p.user_id
      AND t_buy.symbol = p.symbol AND t_buy.side = 'BUY' AND t_buy.is_paper = true
      AND ABS(t_buy.price::numeric - p.entry_price::numeric) < 0.01
    WHERE p.user_id = ${uid}::uuid AND p.symbol = 'mSOL/USDT' AND p.status = 'closed'
    ORDER BY p.closed_at DESC LIMIT 5
  `);
  console.log('\n=== mSOL position vs trade comparison ===');
  msol.forEach((r: any) => {
    const posAmt = parseFloat(r.pos_amount||0);
    const buyAmt = parseFloat(r.buy_amount||0);
    const sellAmt = parseFloat(r.sell_amount||0);
    const entryP = parseFloat(r.entry_price||0);
    const exitP = parseFloat(r.exit_price||0);
    const sellTv = parseFloat(r.sell_tv||0);
    // What bot detail calculates: (exit-entry)*pos_amount
    const botDetailPnl = (exitP - entryP) * posAmt;
    // What trade history shows: trades.pnl
    const tradeHistPnl = parseFloat(r.trade_pnl||0);
    console.log(` pos_amt=${posAmt.toFixed(4)} buy_amt=${buyAmt.toFixed(4)} sell_amt=${sellAmt.toFixed(4)}`);
    console.log(`   entry=$${entryP} exit=$${exitP} | pos_pnl=$${r.pos_pnl} | trade_pnl=$${tradeHistPnl.toFixed(4)}`);
    console.log(`   bot_detail_would_show=$${botDetailPnl.toFixed(4)} DIFF=$${(botDetailPnl - tradeHistPnl).toFixed(4)}`);
  });

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

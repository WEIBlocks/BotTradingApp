import { db } from '../src/config/database.js';
import { sql } from 'drizzle-orm';

async function main() {
  const rows = await (db as any).execute(sql`SELECT id FROM users WHERE email = 'farooqtariq400@gmail.com' LIMIT 1`);
  const uid = rows[0].id;

  // Last 10 SELL trades with all relevant fields
  const trades = await (db as any).execute(sql`
    SELECT t.id, t.symbol, t.side, t.amount, t.price, t.total_value, t.pnl, t.pnl_percent,
           t.shadow_session_id, t.executed_at
    FROM trades t
    WHERE t.user_id = ${uid}::uuid AND t.side = 'SELL' AND t.is_paper = true
    ORDER BY t.executed_at DESC
    LIMIT 10
  `);
  console.log('=== Last 10 SELL trades ===');
  trades.forEach((r: any) => console.log(
    ` ${r.symbol} | price=$${parseFloat(r.price).toFixed(4)} | amount=${parseFloat(r.amount).toFixed(6)} | tv=$${parseFloat(r.total_value||0).toFixed(4)} | pnl=$${r.pnl} | pnl%=${r.pnl_percent} | session=${r.shadow_session_id?.slice(0,8)}`
  ));

  // Check bot positions for these trades — what entry price was used
  const positions = await (db as any).execute(sql`
    SELECT p.symbol, p.entry_price, p.exit_price, p.amount, p.pnl, p.pnl_percent,
           p.status, p.entry_trade_id, p.exit_trade_id, p.shadow_session_id
    FROM bot_positions p
    WHERE p.user_id = ${uid}::uuid AND p.status = 'closed'
    ORDER BY p.closed_at DESC
    LIMIT 10
  `);
  console.log('\n=== Last 10 closed bot_positions ===');
  positions.forEach((r: any) => console.log(
    ` ${r.symbol} | entry=$${parseFloat(r.entry_price||0).toFixed(4)} | exit=$${parseFloat(r.exit_price||0).toFixed(4)} | amt=${parseFloat(r.amount||0).toFixed(6)} | pnl=$${r.pnl} | pnl%=${r.pnl_percent} | session=${r.shadow_session_id?.slice(0,8)}`
  ));

  // What the bots service returns for stats (this is what bot detail page shows)
  const botStats = await (db as any).execute(sql`
    SELECT b.id, b.name,
      COUNT(DISTINCT CASE WHEN t.side='SELL' AND t.pnl IS NOT NULL THEN t.id END)::int as sell_count,
      ROUND(SUM(CASE WHEN t.side='SELL' THEN COALESCE(t.pnl::numeric, 0) ELSE 0 END), 4) as total_pnl,
      ROUND(AVG(CASE WHEN t.side='SELL' AND t.pnl IS NOT NULL THEN t.pnl::numeric END), 4) as avg_pnl
    FROM bots b
    LEFT JOIN bot_subscriptions bs ON bs.bot_id = b.id AND bs.user_id = ${uid}::uuid
    LEFT JOIN shadow_sessions ss ON ss.subscription_id = bs.id
    LEFT JOIN trades t ON t.shadow_session_id = ss.id AND t.user_id = ${uid}::uuid
    WHERE b.id IN (SELECT DISTINCT bot_id FROM bot_subscriptions WHERE user_id = ${uid}::uuid)
    GROUP BY b.id, b.name
  `);
  console.log('\n=== Bot stats (as bot detail page sees them) ===');
  botStats.forEach((r: any) => console.log(
    ` ${r.name} | sell_count=${r.sell_count} | total_pnl=$${r.total_pnl} | avg_pnl=$${r.avg_pnl}`
  ));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

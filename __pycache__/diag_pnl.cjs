const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

(async () => {
  const u = await sql`SELECT id, email FROM users WHERE email = 'farooqtariq400@gmail.com'`;
  if (!u.length) { console.log('NO USER'); await sql.end(); return; }
  const userId = u[0].id;
  console.log('userId:', userId);

  // Per-bot per-mode (live vs shadow) PnL aggregation from bot_positions.
  console.log('\n=== Per-bot PnL breakdown (closed positions) ===');
  const perBot = await sql`
    SELECT
      b.id            AS bot_id,
      b.name          AS bot_name,
      b.category      AS bot_category,
      bp.is_paper,
      COUNT(*)::int   AS closed_n,
      SUM((bp.pnl)::numeric)::numeric(14,2) AS total_pnl,
      SUM(CASE WHEN bp.pnl::numeric > 0 THEN 1 ELSE 0 END)::int AS wins,
      SUM(CASE WHEN bp.pnl::numeric <= 0 THEN 1 ELSE 0 END)::int AS losses,
      MIN(bp.opened_at)::text AS first_at,
      MAX(bp.closed_at)::text AS last_at
    FROM bot_positions bp
    JOIN bots b ON b.id = bp.bot_id
    WHERE bp.user_id = ${userId} AND bp.status = 'closed'
    GROUP BY b.id, b.name, b.category, bp.is_paper
    ORDER BY total_pnl DESC NULLS LAST
  `;
  for (const row of perBot) console.log(JSON.stringify(row));

  // OPEN positions — unrealized PnL (need current price; here we just show count + entry value)
  console.log('\n=== Open positions (unrealized — count only) ===');
  const open = await sql`
    SELECT
      b.id            AS bot_id,
      b.name          AS bot_name,
      b.category      AS bot_category,
      bp.is_paper,
      COUNT(*)::int   AS open_n,
      SUM((bp.pnl)::numeric)::numeric(14,2) AS unrealized_pnl_so_far,
      SUM((bp.entry_value)::numeric)::numeric(14,2) AS entry_value_total
    FROM bot_positions bp
    JOIN bots b ON b.id = bp.bot_id
    WHERE bp.user_id = ${userId} AND bp.status = 'open'
    GROUP BY b.id, b.name, b.category, bp.is_paper
  `;
  for (const row of open) console.log(JSON.stringify(row));

  // Aggregate by mode + asset class
  console.log('\n=== Aggregate by (live/paper) × (crypto/stocks) ===');
  // Determine asset class: crypto if any pair contains "/", else stocks; fallback to category.
  const agg = await sql`
    WITH classified AS (
      SELECT
        bp.is_paper,
        CASE
          WHEN b.category = 'Stocks' THEN 'stocks'
          WHEN b.category = 'Crypto' THEN 'crypto'
          WHEN bp.symbol LIKE '%/%' THEN 'crypto'
          ELSE 'stocks'
        END AS asset_class,
        bp.pnl
      FROM bot_positions bp
      JOIN bots b ON b.id = bp.bot_id
      WHERE bp.user_id = ${userId} AND bp.status = 'closed'
    )
    SELECT
      is_paper,
      asset_class,
      COUNT(*)::int AS n,
      SUM(pnl::numeric)::numeric(14,2) AS total_pnl,
      AVG(pnl::numeric)::numeric(14,2) AS avg_pnl,
      SUM(CASE WHEN pnl::numeric > 0 THEN 1 ELSE 0 END)::int AS wins
    FROM classified
    GROUP BY is_paper, asset_class
    ORDER BY is_paper, asset_class
  `;
  for (const row of agg) console.log(JSON.stringify(row));

  // Trades table (independent verification path)
  console.log('\n=== TRADES table aggregate (separate ledger) ===');
  const trades = await sql`
    SELECT
      t.is_paper,
      CASE WHEN t.symbol LIKE '%/%' THEN 'crypto' ELSE 'stocks' END AS asset_class,
      t.side,
      COUNT(*)::int AS n,
      SUM((t.amount * t.price)::numeric)::numeric(14,2) AS total_value
    FROM trades t
    WHERE t.user_id = ${userId}
    GROUP BY t.is_paper, asset_class, t.side
    ORDER BY t.is_paper, asset_class, t.side
  `;
  for (const row of trades) console.log(JSON.stringify(row));

  // Sanity check the per-mode totals against bot_positions service-style aggregation
  console.log('\n=== Bot subscription view (running modes) ===');
  const subs = await sql`
    SELECT bs.id, bs.bot_id, b.name AS bot_name, b.category, bs.status, bs.mode, bs.allocated_amount
    FROM bot_subscriptions bs
    JOIN bots b ON b.id = bs.bot_id
    WHERE bs.user_id = ${userId}
    ORDER BY bs.created_at DESC
  `;
  for (const row of subs) console.log(JSON.stringify(row));

  await sql.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

(async () => {
  const u = await sql`SELECT id, email, name FROM users WHERE email = 'farooqtariq400@gmail.com'`;
  if (!u.length) { console.log('USER NOT FOUND'); await sql.end(); return; }
  const userId = u[0].id;
  console.log('USER:', JSON.stringify(u[0]));

  console.log('\n=== exchange_connections ===');
  const ec = await sql`
    SELECT id, provider, asset_class, status, sandbox, total_balance, last_sync_at,
           created_at,
           EXTRACT(EPOCH FROM (now() - last_sync_at))::int AS sec_since_sync
    FROM exchange_connections
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  for (const r of ec) console.log(JSON.stringify(r));

  console.log('\n=== exchange_assets (per-coin holdings) ===');
  if (ec.length) {
    const ids = ec.map(e => e.id);
    const ea = await sql`
      SELECT *
      FROM exchange_assets
      WHERE exchange_conn_id IN ${sql(ids)}
      LIMIT 5
    `;
    for (const r of ea) console.log(' ', JSON.stringify(r));
    if (!ea.length) console.log('  (no rows)');
  }

  console.log('\n=== portfolio_snapshots (count + latest) ===');
  const ps = await sql`
    SELECT COUNT(*)::int AS n,
           MIN(date)::text AS first_at,
           MAX(date)::text AS last_at
    FROM portfolio_snapshots
    WHERE user_id = ${userId}
  `;
  console.log(JSON.stringify(ps[0]));
  const psSample = await sql`
    SELECT date, total_value, change_24h, granularity
    FROM portfolio_snapshots
    WHERE user_id = ${userId}
    ORDER BY date DESC
    LIMIT 10
  `;
  console.log(' Latest 10 snapshots:');
  for (const r of psSample) console.log('  ', JSON.stringify(r));

  console.log('\n=== bot_subscriptions ===');
  const bs = await sql`
    SELECT id, bot_id, status, mode, allocated_amount, exchange_conn_id, created_at
    FROM bot_subscriptions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 10
  `;
  for (const r of bs) console.log(' ', JSON.stringify(r));

  console.log('\n=== bot_positions (last 7 days, by mode) ===');
  const bp = await sql`
    SELECT is_paper, status, count(*)::int AS n
    FROM bot_positions
    WHERE user_id = ${userId} AND opened_at >= now() - interval '7 days'
    GROUP BY is_paper, status
    ORDER BY is_paper, status
  `;
  for (const r of bp) console.log(' ', JSON.stringify(r));

  console.log('\n=== bot_positions PnL (closed, by mode) ===');
  const bpPnl = await sql`
    SELECT is_paper,
           count(*)::int AS n,
           SUM(pnl::numeric)::numeric(14,2) AS total_pnl
    FROM bot_positions
    WHERE user_id = ${userId} AND status = 'closed'
    GROUP BY is_paper
  `;
  for (const r of bpPnl) console.log(' ', JSON.stringify(r));

  await sql.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

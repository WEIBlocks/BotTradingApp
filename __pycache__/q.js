const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  await c.connect();
  const u = await c.query('SELECT id, email, name FROM users WHERE email = $1', ['farooqtariq400@gmail.com']);
  if (!u.rows.length) { console.log('USER NOT FOUND'); process.exit(0); }
  const userId = u.rows[0].id;
  console.log('USER:', JSON.stringify(u.rows[0]));

  const s = await c.query(
    "SELECT id, status, mode, virtual_balance, crypto_balance, stock_balance, duration_seconds, started_at, ended_at, EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))::int AS elapsed FROM arena_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5",
    [userId]
  );
  console.log('\nLAST 5 SESSIONS:');
  for (const r of s.rows) console.log(JSON.stringify(r));
  if (s.rows.length === 0) { await c.end(); return; }

  const sessId = s.rows[0].id;
  console.log('\nFOCUSING ON sess', sessId);

  const g = await c.query(
    "SELECT g.id, g.bot_id, b.name AS bot_name, g.rank, g.final_return, g.win_rate, g.total_trades, g.total_pnl, jsonb_array_length(COALESCE(g.equity_data, '[]'::jsonb)) AS equity_points, jsonb_array_length(COALESCE(g.decision_log, '[]'::jsonb)) AS decision_count FROM arena_gladiators g LEFT JOIN bots b ON b.id = g.bot_id WHERE g.session_id = $1 ORDER BY g.rank NULLS LAST",
    [sessId]
  );
  console.log(`\nGLADIATORS (${g.rows.length}):`);
  for (const r of g.rows) console.log(JSON.stringify(r));

  // Sample equity data shape from first gladiator that has one
  for (const r of g.rows) {
    const e = await c.query("SELECT equity_data FROM arena_gladiators WHERE id = $1", [r.id]);
    const ed = e.rows[0].equity_data;
    if (Array.isArray(ed) && ed.length > 0) {
      console.log(`\nSAMPLE equity_data for ${r.bot_name} (${ed.length} pts):`);
      console.log('  first:', JSON.stringify(ed[0]));
      console.log('  last:', JSON.stringify(ed[ed.length - 1]));
      break;
    }
  }

  // Count actual trades + decisions in normalized tables for this user/session bots
  const botIds = g.rows.map(r => r.bot_id);
  if (botIds.length > 0) {
    const t = await c.query(
      "SELECT bot_id, status, count(*)::int AS n FROM bot_positions WHERE bot_id = ANY($1) AND user_id = $2 AND opened_at >= $3 GROUP BY bot_id, status",
      [botIds, userId, s.rows[0].started_at]
    );
    console.log('\nbot_positions during session window:');
    for (const r of t.rows) console.log(' ', JSON.stringify(r));

    const d = await c.query(
      "SELECT bot_id, action, count(*)::int AS n FROM bot_decisions WHERE bot_id = ANY($1) AND user_id = $2 AND created_at >= $3 GROUP BY bot_id, action",
      [botIds, userId, s.rows[0].started_at]
    );
    console.log('\nbot_decisions during session window:');
    for (const r of d.rows) console.log(' ', JSON.stringify(r));
  }

  await c.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });

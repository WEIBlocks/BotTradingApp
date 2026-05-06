const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

(async () => {
  const u = await sql`SELECT id, email, name FROM users WHERE email = 'farooqtariq400@gmail.com'`;
  if (!u.length) { console.log('USER NOT FOUND'); await sql.end(); return; }
  const userId = u[0].id;
  console.log('USER:', JSON.stringify(u[0]));

  const s = await sql`
    SELECT id, status, mode, virtual_balance, crypto_balance, stock_balance,
           duration_seconds, started_at, ended_at,
           EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))::int AS elapsed
    FROM arena_sessions
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log('\nLAST 5 SESSIONS:');
  for (const r of s) console.log(JSON.stringify(r));
  if (!s.length) { await sql.end(); return; }

  const sessId = s[0].id;
  const startedAt = s[0].started_at;
  console.log('\nFOCUSING ON sess', sessId);

  const g = await sql`
    SELECT g.id, g.bot_id, b.name AS bot_name, g.rank, g.final_return, g.win_rate,
           g.total_trades, g.total_pnl,
           jsonb_array_length(COALESCE(g.equity_data, '[]'::jsonb)) AS equity_points,
           jsonb_array_length(COALESCE(g.decision_log, '[]'::jsonb)) AS decision_count
    FROM arena_gladiators g
    LEFT JOIN bots b ON b.id = g.bot_id
    WHERE g.session_id = ${sessId}
    ORDER BY g.rank NULLS LAST
  `;
  console.log(`\nGLADIATORS (${g.length}):`);
  for (const r of g) console.log(JSON.stringify(r));

  // Sample equity_data shape
  for (const r of g) {
    const e = await sql`SELECT equity_data FROM arena_gladiators WHERE id = ${r.id}`;
    const ed = e[0].equity_data;
    if (Array.isArray(ed) && ed.length > 0) {
      console.log(`\nSAMPLE equity_data for ${r.bot_name} (${ed.length} pts):`);
      console.log('  first:', JSON.stringify(ed[0]));
      console.log('  last:', JSON.stringify(ed[ed.length - 1]));
      break;
    }
  }

  // Cross-check actual positions / decisions
  const botIds = g.map(r => r.bot_id);
  if (botIds.length) {
    const t = await sql`
      SELECT bot_id, status, count(*)::int AS n
      FROM bot_positions
      WHERE bot_id IN ${sql(botIds)} AND user_id = ${userId} AND opened_at >= ${startedAt}
      GROUP BY bot_id, status
    `;
    console.log('\nbot_positions during session window:');
    for (const r of t) console.log(' ', JSON.stringify(r));

    const d = await sql`
      SELECT bot_id, action, count(*)::int AS n
      FROM bot_decisions
      WHERE bot_id IN ${sql(botIds)} AND user_id = ${userId} AND created_at >= ${startedAt}
      GROUP BY bot_id, action
    `;
    console.log('\nbot_decisions during session window:');
    for (const r of d) console.log(' ', JSON.stringify(r));
  }

  await sql.end();
})().catch(e => { console.error('ERR:', e.message, e.stack); process.exit(1); });

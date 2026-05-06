// Recompute totalTrades, winRate, totalPnl on completed arena sessions so that
// historical data matches the corrected formula (closed + open trades).
//
// Affects ONLY status='completed' (or 'killed') sessions where the user already
// saw the inconsistent numbers. We don't touch active/running sessions.

const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

(async () => {
  const sessions = await sql`
    SELECT id, user_id, mode, started_at
    FROM arena_sessions
    WHERE status IN ('completed', 'killed')
    ORDER BY created_at DESC
  `;
  console.log(`Backfilling ${sessions.length} sessions...`);

  let updatedGladiators = 0;
  for (const s of sessions) {
    const isLive = s.mode === 'live';
    const glads = await sql`
      SELECT id, bot_id FROM arena_gladiators WHERE session_id = ${s.id}
    `;
    for (const g of glads) {
      const positions = await sql`
        SELECT status, pnl FROM bot_positions
        WHERE bot_id = ${g.bot_id} AND user_id = ${s.user_id}
          AND is_paper = ${!isLive}
          AND shadow_session_id = ${g.id}
      `;
      const closed = positions.filter(p => p.status === 'closed');
      const open = positions.filter(p => p.status === 'open');
      const trades = closed.length + open.length;
      const wins = closed.filter(p => parseFloat(p.pnl ?? '0') > 0).length;
      const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

      await sql`
        UPDATE arena_gladiators
        SET total_trades = ${trades},
            win_rate = ${winRate.toFixed(2)}
        WHERE id = ${g.id}
      `;
      updatedGladiators++;
    }
  }
  console.log(`Updated ${updatedGladiators} gladiator rows.`);
  await sql.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

import postgres from 'postgres';
const sql = postgres('postgresql://neondb_owner:npg_38hyiAPKuJFV@ep-dark-silence-amfjdr3q.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require', { ssl: 'require' });

try {
  // Server's current time + DB current time
  const nowDb = await sql`SELECT NOW() AS db_now, NOW() AT TIME ZONE 'UTC' AS db_utc`;
  const nodeNow = new Date();
  console.log(`Node (this machine) UTC: ${nodeNow.toISOString()}`);
  console.log(`DB NOW():                ${nowDb[0].db_now.toISOString()}`);
  console.log(`DB at UTC:               ${nowDb[0].db_utc.toISOString()}`);
  console.log('');

  // Check every running session — has its endsAt already passed?
  const rows = await sql`
    SELECT ss.id, ss.ends_at, ss.created_at, ss.duration_days,
           u.name AS user_name,
           b.name AS bot_name,
           (NOW() >= ss.ends_at) AS already_past_end,
           EXTRACT(EPOCH FROM (ss.ends_at - NOW()))/3600 AS hours_remaining
    FROM shadow_sessions ss
    LEFT JOIN users u ON u.id = ss.user_id
    LEFT JOIN bots b ON b.id = ss.bot_id
    WHERE ss.status = 'running'
    ORDER BY ss.ends_at ASC
  `;

  console.log(`=== ${rows.length} running shadow sessions ===\n`);
  rows.forEach((r, i) => {
    const ends = r.ends_at.toISOString().slice(0,16).replace('T', ' ');
    const hrs  = Number(r.hours_remaining).toFixed(2);
    const flag = r.already_past_end ? '⚠️  PAST END (should auto-complete)' : `🟢 ${hrs}h remaining`;
    console.log(`  ${i+1}. ${r.bot_name}`);
    console.log(`      ends_at=${ends} UTC  |  ${flag}`);
  });

  // Also check the cron job — last run time
  console.log('\n=== Sessions still flagged "running" but with ends_at < now ===');
  const expired = rows.filter(r => r.already_past_end);
  console.log(`  ${expired.length} stuck sessions (the shadow-trade cron should auto-complete these on next tick)`);

  await sql.end();
} catch (e) {
  console.error('ERROR:', e.message);
  await sql.end();
}

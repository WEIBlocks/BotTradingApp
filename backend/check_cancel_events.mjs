import postgres from 'postgres';
const sql = postgres('postgresql://neondb_owner:npg_38hyiAPKuJFV@ep-dark-silence-amfjdr3q.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require', { ssl: 'require' });

try {
  // First check what columns exist
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='shadow_sessions' ORDER BY ordinal_position`;
  console.log('shadow_sessions columns:', cols.map(c => c.column_name).join(', '));
  console.log('');

  // Cancelled shadow sessions — most recent first, with user info
  const rows = await sql`
    SELECT ss.*,
           u.name AS user_name, u.email,
           b.name AS bot_name, b.category
    FROM shadow_sessions ss
    LEFT JOIN users u ON u.id = ss.user_id
    LEFT JOIN bots b ON b.id = ss.bot_id
    WHERE ss.status = 'cancelled'
    ORDER BY ss.ends_at DESC NULLS LAST
    LIMIT 30
  `;
  console.log(`=== Cancelled shadow sessions (latest 30 of ${rows.length}+) ===`);
  rows.forEach(r => {
    const ends      = r.ends_at?.toISOString?.().slice(0,16) ?? 'n/a';
    const created   = r.created_at?.toISOString?.().slice(0,16) ?? 'n/a';
    console.log(`  ends=${ends} | created=${created} | ${r.user_name?.padEnd(22)} | ${r.bot_name} [${r.category}]`);
  });

  // Counts by user
  console.log('\n=== Cancellation count per user ===');
  const counts = await sql`
    SELECT u.name, u.email, COUNT(*)::int as cancels
    FROM shadow_sessions ss
    LEFT JOIN users u ON u.id = ss.user_id
    WHERE ss.status = 'cancelled'
    GROUP BY u.name, u.email
    ORDER BY cancels DESC
  `;
  counts.forEach(r => console.log(`  ${r.cancels.toString().padStart(3)}  ${r.name} (${r.email})`));

  // Check schema for cancellation_reason field
  console.log('\n=== Sample cancelled session columns ===');
  const sample = await sql`SELECT * FROM shadow_sessions WHERE status='cancelled' ORDER BY created_at DESC LIMIT 1`;
  if (sample[0]) console.log('  Columns:', Object.keys(sample[0]).join(', '));

  await sql.end();
} catch (e) {
  console.error('ERROR:', e.message);
  await sql.end();
}

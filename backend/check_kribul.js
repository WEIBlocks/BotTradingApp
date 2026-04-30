// Check user "kribul" bot/session status
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_38hyiAPKuJFV@ep-dark-silence-amfjdr3q.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require',
});

(async () => {
  try {
    // Find user by name/email containing "kribul"
    const userRes = await pool.query(`
      SELECT id, name, email, role, created_at
      FROM users
      WHERE LOWER(name) LIKE '%kribul%' OR LOWER(email) LIKE '%kribul%'
    `);
    console.log('=== Matching users ===');
    console.log(userRes.rows);

    if (userRes.rows.length === 0) {
      console.log('No user found with "kribul"');
      await pool.end();
      return;
    }

    for (const u of userRes.rows) {
      console.log(`\n========== User: ${u.name} (${u.email}) ==========`);

      // Active subscriptions (live + shadow + paused)
      const subs = await pool.query(`
        SELECT bs.id, bs.bot_id, bs.status, bs.mode, bs.created_at,
               b.name as bot_name, b.category
        FROM bot_subscriptions bs
        LEFT JOIN bots b ON b.id = bs.bot_id
        WHERE bs.user_id = $1
        ORDER BY bs.created_at DESC
      `, [u.id]);
      console.log(`\n-- bot_subscriptions (${subs.rows.length}) --`);
      subs.rows.forEach(s => {
        console.log(`  [${s.status}/${s.mode}] ${s.bot_name} (${s.category})  bot=${s.bot_id.slice(0,8)} sub=${s.id.slice(0,8)}`);
      });

      // Shadow sessions
      const shadows = await pool.query(`
        SELECT ss.id, ss.bot_id, ss.status, ss.created_at, ss.ends_at,
               b.name as bot_name, b.category
        FROM shadow_sessions ss
        LEFT JOIN bots b ON b.id = ss.bot_id
        WHERE ss.user_id = $1
        ORDER BY ss.created_at DESC
      `, [u.id]);
      console.log(`\n-- shadow_sessions (${shadows.rows.length}) --`);
      shadows.rows.forEach(s => {
        console.log(`  [${s.status}] ${s.bot_name} (${s.category})  ends=${s.ends_at}  id=${s.id.slice(0,8)}`);
      });

      // Counts
      const running = subs.rows.filter(s => s.status === 'active' || s.status === 'shadow').length;
      const shadowRunning = shadows.rows.filter(s => s.status === 'running').length;
      console.log(`\n>> SUMMARY for ${u.email}`);
      console.log(`   Active subscriptions: ${subs.rows.filter(s => s.status === 'active').length}`);
      console.log(`   Paused subscriptions: ${subs.rows.filter(s => s.status === 'paused').length}`);
      console.log(`   Stopped subscriptions: ${subs.rows.filter(s => s.status === 'stopped').length}`);
      console.log(`   Running shadow sessions: ${shadowRunning}`);
      console.log(`   Completed shadow sessions: ${shadows.rows.filter(s => s.status === 'completed').length}`);
      console.log(`   Paused shadow sessions: ${shadows.rows.filter(s => s.status === 'paused').length}`);
    }

    // Overall platform-wide stats
    console.log('\n\n========== PLATFORM-WIDE ==========');
    const totalSubs = await pool.query(`
      SELECT status, COUNT(*) as count FROM bot_subscriptions GROUP BY status ORDER BY count DESC
    `);
    console.log('-- bot_subscriptions by status --');
    totalSubs.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

    const totalShadows = await pool.query(`
      SELECT status, COUNT(*) as count FROM shadow_sessions GROUP BY status ORDER BY count DESC
    `);
    console.log('-- shadow_sessions by status --');
    totalShadows.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

    await pool.end();
  } catch (e) {
    console.error('ERROR:', e.message);
    await pool.end();
  }
})();

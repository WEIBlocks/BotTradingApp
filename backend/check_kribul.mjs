import postgres from 'postgres';

const sql = postgres('postgresql://neondb_owner:npg_38hyiAPKuJFV@ep-dark-silence-amfjdr3q.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require', {
  ssl: 'require',
});

try {
  const users = await sql`
    SELECT id, name, email, role, created_at
    FROM users
    WHERE LOWER(name) LIKE '%kirubel%' OR LOWER(email) LIKE '%kirubel%'
    ORDER BY created_at DESC
  `;
  console.log(`=== Kirubel users (${users.length}) ===`);
  users.forEach(u => console.log(`  ${u.name} | ${u.email} | role=${u.role} | id=${u.id}`));

  for (const u of users) {
    console.log(`\n========== ${u.name} (${u.email}) ==========`);

    const subs = await sql`
      SELECT bs.id, bs.status, bs.mode, bs.created_at,
             b.name as bot_name, b.category
      FROM bot_subscriptions bs
      LEFT JOIN bots b ON b.id = bs.bot_id
      WHERE bs.user_id = ${u.id}
      ORDER BY bs.created_at DESC
    `;
    console.log(`\n  bot_subscriptions: ${subs.length}`);
    subs.forEach(s => {
      console.log(`    [${s.status}/${s.mode}] ${s.bot_name} (${s.category})  created=${s.created_at?.toISOString?.().slice(0,10)}`);
    });

    const shadows = await sql`
      SELECT ss.id, ss.status, ss.created_at, ss.ends_at,
             b.name as bot_name, b.category
      FROM shadow_sessions ss
      LEFT JOIN bots b ON b.id = ss.bot_id
      WHERE ss.user_id = ${u.id}
      ORDER BY ss.created_at DESC
    `;
    console.log(`\n  shadow_sessions: ${shadows.length}`);
    shadows.forEach(s => {
      console.log(`    [${s.status}] ${s.bot_name} (${s.category})  ends=${s.ends_at?.toISOString?.().slice(0,16) ?? 'n/a'}`);
    });

    // Bots they created (since some are creators)
    const created = await sql`
      SELECT id, name, category, status, created_at
      FROM bots
      WHERE creator_id = ${u.id}
      ORDER BY created_at DESC
    `;
    console.log(`\n  bots created: ${created.length}`);
    created.forEach(b => console.log(`    [${b.status}] ${b.name} (${b.category})`));

    const liveCount = subs.filter(s => s.status === 'active').length;
    const shadowSubCount = subs.filter(s => s.status === 'shadow').length;
    const runningShadowSessions = shadows.filter(s => s.status === 'running').length;

    console.log(`\n  >> Currently RUNNING for ${u.email}:`);
    console.log(`     Live (active subscriptions):     ${liveCount}`);
    console.log(`     Shadow (running shadow sessions): ${runningShadowSessions}`);
    console.log(`     Total running:                    ${liveCount + runningShadowSessions}`);
  }

  console.log('\n\n========== PLATFORM-WIDE ==========');
  const totalSubs = await sql`SELECT status, COUNT(*)::int as count FROM bot_subscriptions GROUP BY status ORDER BY count DESC`;
  console.log('bot_subscriptions:');
  totalSubs.forEach(r => console.log(`  ${r.status}: ${r.count}`));

  const totalShadows = await sql`SELECT status, COUNT(*)::int as count FROM shadow_sessions GROUP BY status ORDER BY count DESC`;
  console.log('shadow_sessions:');
  totalShadows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

  // Total users
  const userCount = await sql`SELECT COUNT(*)::int as c FROM users`;
  const botCount = await sql`SELECT COUNT(*)::int as c FROM bots`;
  console.log(`\nTotal users: ${userCount[0].c}`);
  console.log(`Total bots: ${botCount[0].c}`);

  await sql.end();
} catch (e) {
  console.error('ERROR:', e.message);
  await sql.end();
}

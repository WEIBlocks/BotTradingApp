import postgres from 'postgres';
const sql = postgres('postgresql://neondb_owner:npg_38hyiAPKuJFV@ep-dark-silence-amfjdr3q.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require', { ssl: 'require' });

try {
  // LIVE — bot_subscriptions with status=active
  const live = await sql`
    SELECT bs.id, bs.mode, bs.created_at,
           u.name AS user_name, u.email,
           b.name AS bot_name, b.category
    FROM bot_subscriptions bs
    LEFT JOIN users u ON u.id = bs.user_id
    LEFT JOIN bots b ON b.id = bs.bot_id
    WHERE bs.status = 'active'
    ORDER BY u.name, bs.created_at DESC
  `;

  // SHADOW — shadow_sessions with status=running
  const shadow = await sql`
    SELECT ss.id, ss.created_at, ss.ends_at,
           u.name AS user_name, u.email,
           b.name AS bot_name, b.category
    FROM shadow_sessions ss
    LEFT JOIN users u ON u.id = ss.user_id
    LEFT JOIN bots b ON b.id = ss.bot_id
    WHERE ss.status = 'running'
    ORDER BY u.name, ss.ends_at ASC
  `;

  console.log('═══════════════════════════════════════════════════════');
  console.log(`  LIVE bots running: ${live.length}`);
  console.log('═══════════════════════════════════════════════════════');
  live.forEach((r, i) => {
    console.log(`  ${i+1}. ${r.user_name} (${r.email})`);
    console.log(`      └─ ${r.bot_name} [${r.category}]  mode=${r.mode}`);
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  SHADOW bots running: ${shadow.length}`);
  console.log('═══════════════════════════════════════════════════════');
  shadow.forEach((r, i) => {
    const ends = r.ends_at?.toISOString?.().slice(0,16).replace('T',' ') ?? 'n/a';
    console.log(`  ${i+1}. ${r.user_name} (${r.email})`);
    console.log(`      └─ ${r.bot_name} [${r.category}]  ends=${ends}`);
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PER-USER SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  const byUser = new Map();
  live.forEach(r => {
    const k = r.email;
    if (!byUser.has(k)) byUser.set(k, { name: r.user_name, email: r.email, live: 0, shadow: 0 });
    byUser.get(k).live++;
  });
  shadow.forEach(r => {
    const k = r.email;
    if (!byUser.has(k)) byUser.set(k, { name: r.user_name, email: r.email, live: 0, shadow: 0 });
    byUser.get(k).shadow++;
  });
  const sorted = [...byUser.values()].sort((a,b) => (b.live+b.shadow) - (a.live+a.shadow));
  sorted.forEach(u => {
    console.log(`  ${u.name} (${u.email})`);
    console.log(`     live=${u.live}  shadow=${u.shadow}  total=${u.live+u.shadow}`);
  });

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  GRAND TOTAL`);
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Live bots running:    ${live.length}`);
  console.log(`  Shadow bots running:  ${shadow.length}`);
  console.log(`  TOTAL running:        ${live.length + shadow.length}`);

  await sql.end();
} catch (e) {
  console.error('ERROR:', e.message);
  await sql.end();
}

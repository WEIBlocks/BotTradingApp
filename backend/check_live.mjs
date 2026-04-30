import postgres from 'postgres';

const sql = postgres('postgresql://neondb_owner:npg_38hyiAPKuJFV@ep-dark-silence-amfjdr3q.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require', {
  ssl: 'require',
});

try {
  const live = await sql`
    SELECT bs.id as sub_id, bs.mode, bs.created_at,
           u.name as user_name, u.email,
           b.name as bot_name, b.category
    FROM bot_subscriptions bs
    LEFT JOIN users u ON u.id = bs.user_id
    LEFT JOIN bots b ON b.id = bs.bot_id
    WHERE bs.status = 'active'
    ORDER BY bs.created_at DESC
  `;
  console.log(`=== Live (active) subscriptions: ${live.length} ===`);
  live.forEach(r => {
    console.log(`  ${r.user_name} (${r.email}) — ${r.bot_name} [${r.category}] mode=${r.mode}`);
  });
  await sql.end();
} catch (e) {
  console.error('ERROR:', e.message);
  await sql.end();
}

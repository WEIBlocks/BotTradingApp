const postgres = require('postgres');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });
(async () => {
  const r = await sql`
    SELECT id, user_id, expires_at, revoked, created_at,
           EXTRACT(EPOCH FROM (expires_at - now()))::int AS sec_until_expiry,
           EXTRACT(EPOCH FROM (now() - created_at))::int AS sec_old
    FROM refresh_tokens
    ORDER BY created_at DESC
    LIMIT 5
  `;
  for (const row of r) {
    console.log(JSON.stringify(row));
  }
  await sql.end();
})().catch(e => { console.error(e.message); process.exit(1); });

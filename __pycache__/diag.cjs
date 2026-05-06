const postgres = require('postgres');
const bcrypt = require('bcryptjs');
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require' });

const TARGET_RAW = process.argv[2]; // raw refresh token from CLI

(async () => {
  // Get all non-revoked tokens for the test user
  const r = await sql`
    SELECT rt.id, rt.user_id, rt.token_hash, rt.expires_at, rt.revoked, rt.created_at,
           EXTRACT(EPOCH FROM (rt.expires_at - now()))::int AS sec_until_expiry
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE u.email = 'user@bottrade.com' AND rt.revoked = false
    ORDER BY rt.created_at DESC
  `;
  console.log(`Non-revoked refresh tokens for user@bottrade.com: ${r.length}`);
  for (const row of r) {
    const matches = await bcrypt.compare(TARGET_RAW, row.token_hash);
    console.log(`  id=${row.id.slice(0,8)}.. created=${row.created_at.toISOString()} expires=${row.expires_at.toISOString()} sec_until=${row.sec_until_expiry} matches=${matches}`);
  }
  await sql.end();
})().catch(e => { console.error(e.message); process.exit(1); });
